import {PMTiles, type RangeResponse, type Source} from "pmtiles";
import {PMTilesVectorSource} from "ol-pmtiles";

/**
 * A pmtiles {@link Source} backed by an ArrayBuffer already resident in memory,
 * so every read is a synchronous slice instead of an HTTP Range request.
 *
 * Why this exists: pmtiles' own FetchSource forces `cache: "no-store"` on
 * Chrome/Windows (a Chromium range-cache bug workaround — see FetchSource in
 * node_modules/pmtiles). That bypasses the browser HTTP cache entirely, so over
 * a network origin EVERY marker tile that leaves OL's parsed-tile cache
 * re-fetches at full latency. On localhost that round-trip is ~0ms and the cost
 * is invisible; on a remote CDN it's the dominant reason markers feel slow. The
 * whole archive is only a few MB, so we trade one cacheable up-front download for
 * zero per-tile network cost. See [[marker-prefetch.ts]] for the parsed-cache
 * (CPU) side of the same problem.
 */
class ArrayBufferSource implements Source {
  constructor(private readonly buffer: ArrayBuffer, private readonly key: string) {}

  getKey(): string {
    return this.key;
  }

  // pmtiles only ever calls this with in-bounds ranges; slice() copies just the
  // requested window. No etag/cache-control fields — pmtiles treats them as
  // optional and skips its ETag-mismatch path when absent (same as FileSource).
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    return {data: this.buffer.slice(offset, offset + length)};
  }
}

/**
 * Fetches the whole `.pmtiles` archive once and swaps it in for the source's
 * network-backed FetchSource, so subsequent `getZxy` reads come from memory.
 *
 * Fire-and-forget and non-blocking: until the download lands the source keeps
 * using its original FetchSource (today's behavior), then transparently
 * upgrades — tiles already parsed into OL's cache stay put, and only
 * not-yet-loaded tiles switch to the in-memory archive. A failed download logs
 * and leaves the network source in place (graceful degradation, never worse than
 * before).
 *
 * Call from outside the Angular zone (it schedules a fetch + promise chain that
 * zone.js would otherwise turn into change-detection churn). Returns a teardown
 * that aborts an in-flight download and drops the buffer reference so it can be
 * GC'd; wire it into the component's ngOnDestroy.
 */
export function preloadPmtilesIntoMemory(source: PMTilesVectorSource, url: string): () => void {
  const controller = new AbortController();
  let disposed = false;

  fetch(url, {signal: controller.signal})
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.arrayBuffer();
    })
    .then(async buffer => {
      const pmtiles = new PMTiles(new ArrayBufferSource(buffer, url));
      // Resolve the header (and thus root directory) from memory up front, so the
      // first getZxy after the swap doesn't observe a half-initialised archive.
      await pmtiles.getHeader();
      if (!disposed) {
        // pmtiles_ is a public field on PMTilesVectorSource (ol-pmtiles' own
        // tileLoadFunction and our throttleVectorTileParsing both read it per
        // tile), so reassigning it redirects every later tile load to memory.
        source.pmtiles_ = pmtiles;
      }
    })
    .catch((err: unknown) => {
      if (!disposed && !(err instanceof DOMException && err.name === "AbortError")) {
        console.warn(`[pmtiles-preload] ${url} stays network-backed:`, err);
      }
    });

  return () => {
    disposed = true;
    controller.abort();
  };
}
