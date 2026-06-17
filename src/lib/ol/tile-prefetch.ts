import OlMap from "ol/Map";
import TileLayer from "ol/layer/Tile";
import ImageTileSource from "ol/source/ImageTile";
import TileGrid from "ol/tilegrid/TileGrid";
import {TileCoord} from "ol/tilecoord";
import {unByKey} from "ol/Observable";
import {expandUrl, pickUrl, renderXYZTemplate} from "ol/uri";
import {buffer as bufferExtent, Extent, getHeight, getIntersection, getWidth, isEmpty} from "ol/extent";

/** Extra viewport fraction fetched per side at the current zoom. */
const BUFFER_RATIO = 0.25;
/** Hard cap per pan/zoom gesture so a fast pan can't queue thousands of tiles. */
const MAX_TILES_PER_MOVE = 120;
/** Let the renderer's own (high-priority) tile loads start first. */
export const DEBOUNCE_MS = 500;
/** Forget prefetch history once the set grows past this. */
const SEEN_LIMIT = 8192;

/**
 * Fetches the newest generation's urls with limited concurrency; a message
 * with a newer generation aborts the loop. Network failures are posted back
 * so the main thread can allow a retry (HTTP 404s resolve normally and stay
 * prefetched-forever, which is what we want for empty-region tiles).
 */
const WORKER_SOURCE = `
let current = 0;
self.onmessage = async ({data: {gen, urls}}) => {
  current = gen;
  let next = 0;
  const run = async () => {
    while (current === gen && next < urls.length) {
      const url = urls[next++];
      try {
        const response = await fetch(url, {mode: "cors", credentials: "omit", priority: "low"});
        // Reading the body guarantees the download completes and is cacheable.
        await response.arrayBuffer();
      } catch {
        self.postMessage(url);
      }
    }
  };
  await Promise.all([run(), run(), run()]);
};
`;

// One worker serves every map instance; the newest postMessage supersedes
// older queues, and activeSeen tracks whichever map scheduled last.
let prefetchWorker: Worker | null | undefined;
let activeSeen: Set<string> | undefined;
let generation = 0;

function getWorker(): Worker | null {
  if (prefetchWorker === undefined) {
    try {
      const blobUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], {type: "text/javascript"}));
      prefetchWorker = new Worker(blobUrl);
      // The worker holds its own copy of the script now; revoke so the blob URL
      // doesn't linger for the page lifetime.
      URL.revokeObjectURL(blobUrl);
      prefetchWorker.onmessage = e => activeSeen?.delete(e.data as string);
    } catch (err) {
      console.warn("[tile-prefetch] worker unavailable, prefetching disabled:", err);
      prefetchWorker = null;
    }
  }
  return prefetchWorker;
}

const coordKey = (coord: TileCoord): string => coord[0] + "/" + coord[1] + "/" + coord[2];

export interface PrefetchCoordOptions {
  /** Extra viewport fraction collected per side at the current zoom. */
  bufferRatio?: number;
  /** Hard cap on NEW (unseen) coords returned per call. */
  maxTiles?: number;
  /**
   * How many levels deeper than the current zoom to warm (for zooming in).
   */
  deeperLevels?: number;
  /**
   * Nearest-direction hint for picking the tile z from the view resolution;
   */
  zDirection?: number;
  /**
   * Dedup key for a coord; defaults to "z/x/y". The raster prefetch keys by URL
   */
  keyOf?: (coord: TileCoord) => string;
}

/**
 * Tile coords to warm around the current view: a buffer ring at the current
 * zoom, `deeperLevels` levels deeper (for zooming in), and the buffer ring one
 * level shallower (for zooming out). Deduped against `seen`, clamped to the grid
 * so no void tile is addressed, the visible extent skipped where the renderer
 * already loads it, and capped at `maxTiles`. Shared by the raster (warms the
 * HTTP cache) and marker (warms the vector-tile data cache) prefetchers — only
 * the per-coord "warm" step the caller runs differs.
 */
export function collectPrefetchTileCoords(
  olMap: OlMap,
  tileGrid: TileGrid,
  seen: Set<string>,
  options: PrefetchCoordOptions = {},
): TileCoord[] {
  const {bufferRatio = BUFFER_RATIO, maxTiles = MAX_TILES_PER_MOVE, zDirection = 0, keyOf = coordKey, deeperLevels = 1} = options;
  const view = olMap.getView();
  const size = olMap.getSize();
  const resolution = view.getResolution();
  if (!size || resolution === undefined) {
    return [];
  }
  const gridExtent = tileGrid.getExtent();
  const visible = view.calculateExtent(size);
  // Clamps to the deepest native level, so the Mists overzoom works out.
  const z = tileGrid.getZForResolution(resolution, zDirection);

  const coords: TileCoord[] = [];
  const collect = (extent: Extent, tileZ: number, skipVisible: boolean) => {
    if (tileZ < tileGrid.getMinZoom() || tileZ > tileGrid.getMaxZoom()) {
      return;
    }
    const clamped = gridExtent ? getIntersection(extent, gridExtent) : extent;
    if (isEmpty(clamped)) {
      return;
    }
    // The renderer already loads the visible extent (and, with preload, its
    // ancestors) itself; fetching those too would double-download anything
    // still in flight.
    const visibleRange = skipVisible ? tileGrid.getTileRangeForExtentAndZ(visible, tileZ) : undefined;
    tileGrid.forEachTileCoord(clamped, tileZ, coord => {
      if (coords.length >= maxTiles || visibleRange?.containsXY(coord[1], coord[2])) {
        return;
      }
      const key = keyOf(coord);
      if (!seen.has(key)) {
        seen.add(key);
        coords.push([coord[0], coord[1], coord[2]]);
      }
    });
  };

  const span = Math.max(getWidth(visible), getHeight(visible));
  const buffered = bufferExtent(visible, bufferRatio * span);
  collect(buffered, z, true);
  for (let level = 1; level <= deeperLevels; level++) {
    collect(bufferExtent(visible, (bufferRatio / level) * span), z + level, false);
  }
  collect(buffered, z - 1, true);  // one level shallower, for zooming out

  if (seen.size > SEEN_LIMIT) {
    seen.clear();
    coords.forEach(c => seen.add(keyOf(c)));
  }

  return coords;
}

/** Returns a teardown that detaches the listeners; call it when the raster
 * layer is removed (e.g. a floor swap) so the closure and its old-floor URL
 * template don't leak and keep prefetching the previous floor. */
export function attachRasterPrefetch(olMap: OlMap, layer: TileLayer<ImageTileSource>, urlTemplate: string): () => void {
  const seen = new Set<string>();
  let debounce: ReturnType<typeof setTimeout> | undefined;
  // Must pick the same subdomain per tile as the source's own loader, or the
  // prefetched response lands under a different HTTP cache key.
  const templates = expandUrl(urlTemplate);
  const urlFor = (z: number, x: number, y: number) =>
    renderXYZTemplate(pickUrl(templates, z, x, y), z, x, y);

  const run = () => {
    const view = olMap.getView();
    if (view.getInteracting() || view.getAnimating()) {
      // Mid-gesture (e.g. kinetic pan still settling); try again once idle.
      debounce = setTimeout(run, DEBOUNCE_MS);
      return;
    }
    const source = layer.getSource();
    if (!source) {
      return;
    }
    const tileGrid = source.getTileGrid();
    if (!tileGrid) {
      return;
    }
    // Key the seen-set by URL (not coord), so the worker's failure-retry — which
    // posts the failed URL back to delete it from `seen` — still lines up.
    const coords = collectPrefetchTileCoords(olMap, tileGrid, seen,
      {keyOf: coord => urlFor(coord[0], coord[1], coord[2])});
    const urls = coords.map(coord => urlFor(coord[0], coord[1], coord[2])).filter(Boolean);

    const worker = getWorker();
    if (worker && urls.length > 0) {
      activeSeen = seen;
      worker.postMessage({gen: ++generation, urls});
    }
  };

  const schedule = () => {
    // Abandon the previous gesture's queue before the renderer competes with it.
    getWorker()?.postMessage({gen: ++generation, urls: []});
    clearTimeout(debounce);
    debounce = setTimeout(run, DEBOUNCE_MS);
  };

  const moveKey = olMap.on("moveend", schedule);
  // moveend only fires on gestures/view changes, so cover the initial view too.
  const loadKey = olMap.once("loadend", schedule);

  return () => {
    clearTimeout(debounce);
    unByKey(moveKey);
    unByKey(loadKey);
  };
}
