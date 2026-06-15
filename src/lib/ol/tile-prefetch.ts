import OlMap from "ol/Map";
import TileLayer from "ol/layer/Tile";
import ImageTileSource from "ol/source/ImageTile";
import {unByKey} from "ol/Observable";
import {expandUrl, pickUrl, renderXYZTemplate} from "ol/uri";
import {buffer as bufferExtent, Extent, getHeight, getIntersection, getWidth, isEmpty} from "ol/extent";

/**
 * Warms the browser HTTP cache for raster tiles in a ring around the viewport
 * and at the adjacent zoom levels, so panning and zooming land on cached tiles
 * instead of popping in.
 *
 * OL 10 keeps the tile cache inside the layer renderer where it can't be
 * populated from outside, so prefetching happens at the network layer: these
 * fetches use the same CORS mode as the renderer's <img> loads and therefore
 * share the HTTP cache with them.
 *
 * The fetch+read loop runs in a Web Worker: on the main thread its promise
 * churn (wrapped by zone.js) and arrayBuffer reads showed up inside pan-frame
 * spikes when profiled. The worker shares the renderer's HTTP cache; only the
 * URL selection (tile-grid math) stays on the main thread.
 */

/** Extra viewport fraction fetched per side at the current zoom. */
const BUFFER_RATIO = 0.25;
/** Hard cap per pan/zoom gesture so a fast pan can't queue thousands of tiles. */
const MAX_TILES_PER_MOVE = 120;
/** Let the renderer's own (high-priority) tile loads start first. */
const DEBOUNCE_MS = 500;
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
      prefetchWorker = new Worker(URL.createObjectURL(new Blob([WORKER_SOURCE], {type: "text/javascript"})));
      prefetchWorker.onmessage = e => activeSeen?.delete(e.data as string);
    } catch (err) {
      console.warn("[tile-prefetch] worker unavailable, prefetching disabled:", err);
      prefetchWorker = null;
    }
  }
  return prefetchWorker;
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
    const size = olMap.getSize();
    const resolution = olMap.getView().getResolution();
    if (!source || !size || resolution === undefined) {
      return;
    }
    const tileGrid = source.getTileGrid();
    if (!tileGrid) {
      return;
    }
    const gridExtent = tileGrid.getExtent();
    const visible = olMap.getView().calculateExtent(size);
    // Clamps to the deepest native level, so the Mists overzoom works out.
    const z = tileGrid.getZForResolution(resolution);

    const urls: string[] = [];
    const collect = (extent: Extent, z: number, skipVisible: boolean) => {
      if (z < tileGrid.getMinZoom() || z > tileGrid.getMaxZoom()) {
        return;
      }
      const clamped = gridExtent ? getIntersection(extent, gridExtent) : extent;
      if (isEmpty(clamped)) {
        return;
      }
      // The renderer already loads the visible extent (and, with preload, its
      // ancestors) itself; fetching those too would double-download anything
      // still in flight.
      const visibleRange = skipVisible ? tileGrid.getTileRangeForExtentAndZ(visible, z) : undefined;
      tileGrid.forEachTileCoord(clamped, z, coord => {
        if (urls.length >= MAX_TILES_PER_MOVE || visibleRange?.containsXY(coord[1], coord[2])) {
          return;
        }
        const url = urlFor(coord[0], coord[1], coord[2]);
        if (url && !seen.has(url)) {
          seen.add(url);
          urls.push(url);
        }
      });
    };

    const buffered = bufferExtent(visible, BUFFER_RATIO * Math.max(getWidth(visible), getHeight(visible)));
    collect(buffered, z, true);      // ring around the viewport
    collect(visible, z + 1, false);  // one level below, for zooming in
    collect(buffered, z - 1, true);  // one level above, for zooming out

    if (seen.size > SEEN_LIMIT) {
      seen.clear();
      urls.forEach(url => seen.add(url));
    }

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
