import OlMap from "ol/Map";
import VectorTileSource from "ol/source/VectorTile";
import VectorRenderTile from "ol/VectorRenderTile";
import TileState from "ol/TileState";
import {unByKey} from "ol/Observable";
import {DEVICE_PIXEL_RATIO} from "ol/has";
import {collectPrefetchTileCoords, DEBOUNCE_MS} from "./tile-prefetch";

/**
 * Most tiles a warm pass retains before the oldest are released. A pass warms at
 * most MARKER_MAX_TILES tiles, so this keeps ~2-3 gestures' worth resident —
 * enough that panning back lands on warm tiles, while bounding the parsed-tile
 * memory (see the leak note below).
 */
export const WARM_CAPACITY = 512;

/**
 * Ring width and per-gesture cap for the MARKER warm pass. Wider and deeper than
 * tile-prefetch's network-bound raster defaults (0.25 / 120) because marker tiles
 * load from an in-memory copy of the whole archive (see preloadPmtilesIntoMemory)
 * — warming them is CPU-only, so we can afford to reach further ahead. Passed
 * per-call so the shared raster prefetch defaults stay untouched.
 */
const MARKER_BUFFER_RATIO = 0.5;
const MARKER_MAX_TILES = 200;

/**
 * Warms the marker VectorTile source's parsed-tile cache in a ring around the
 * viewport and at the adjacent zoom levels, so panning and zooming-in land on
 * already-parsed marker tiles instead of popping in.
 *
 * The raster base map gets this for free from attachRasterPrefetch by warming
 * the browser HTTP cache, but that does nothing for the PMTiles markers: pmtiles
 * fetches tile bytes with Range requests and caches none of them (and forces
 * `cache: "no-store"` on Chrome/Windows). The only cache that helps is OL's own
 * parsed-tile map (source.sourceTiles_): getTile(...).load() loads the data tiles
 * into it, and when the renderer later needs the same tile it reuses the parsed
 * features (no re-fetch, no re-parse). The MVT parse (ol-pmtiles' stock loader,
 * synchronous on the main thread) runs here rather than during a pan because this
 * fires DEBOUNCE_MS after the gesture settles (and bails while the view is still
 * interacting/animating), so it never competes with pan frames.
 *
 * Leak control: a warmed render tile keeps its source tiles in sourceTiles_ until
 * released — left unreleased they accumulate forever. So warmed tiles are held in
 * an insertion-ordered map and the oldest are release()d past WARM_CAPACITY;
 * release() drops the source tiles the renderer isn't also using and leaves the
 * rest (the renderer holds its own reference), so the working set stays bounded.
 *
 * Brittleness — this rests on two behavioral contracts of OL's VectorTile source
 * that are NOT part of its documented public API: (1) getTile() hands back a
 * fresh, renderer-unmanaged tile we own; and (2) release() is safe to call from
 * application code as a refcount decrement (its own JSDoc says it is "called by
 * the tile cache ... due to expiry") and frees only source tiles no other render
 * tile references. Both hold in OL 10.9 and are how OL's renderer itself drives
 * the source, but a vector-tile cache refactor could break them silently (marker
 * flicker, no thrown error). marker-prefetch.spec.ts pins both so an OL upgrade
 * fails CI instead of shipping the regression.
 *
 * Call from outside the Angular zone (each tile.load() kicks off a fetch +
 * synchronous decode that zone.js would otherwise turn into change-detection
 * churn). Returns a teardown that releases everything and detaches the listeners.
 */
export function attachMarkerPrefetch(olMap: OlMap, source: VectorTileSource): () => void {
  // key "z/x/y" -> warmed tile, in insertion order (oldest first) for FIFO eviction.
  const warm = new Map<string, VectorRenderTile>();
  let debounce: ReturnType<typeof setTimeout> | undefined;
  // VectorTile sources default zDirection to 1; only matters at fractional zoom
  // (e.g. the Mists), where it must match how the renderer rounds to a tile z.
  const zDirection = typeof source.zDirection === "number" ? source.zDirection : 1;

  const evictToCapacity = () => {
    while (warm.size > WARM_CAPACITY) {
      const oldest = warm.keys().next().value as string;
      warm.get(oldest)!.release();
      warm.delete(oldest);
    }
  };

  const run = () => {
    const view = olMap.getView();
    if (view.getInteracting() || view.getAnimating()) {
      // Mid-gesture (e.g. kinetic pan still settling); try again once idle.
      debounce = setTimeout(run, DEBOUNCE_MS);
      return;
    }
    const projection = view.getProjection();
    // The projection grid is what the renderer addresses tiles on; collecting on
    // it (not the raw source grid) keeps coords aligned with the render requests,
    // so warmed tiles are the same ones the renderer reuses. Dedup against what's
    // already warm so a coord still resident is never re-fetched.
    const tileGrid = source.getTileGridForProjection(projection);
    const coords = collectPrefetchTileCoords(olMap, tileGrid, new Set(warm.keys()),
      {zDirection, bufferRatio: MARKER_BUFFER_RATIO, maxTiles: MARKER_MAX_TILES});
    for (const [z, x, y] of coords) {
      const tile = source.getTile(z, x, y, DEVICE_PIXEL_RATIO, projection);
      // IDLE skips EMPTY tiles (e.g. z+1 past the deepest pmtiles level, or
      // outside the data extent) — getTile marks those EMPTY automatically.
      if (tile.getState() === TileState.IDLE) {
        tile.load();
        warm.set(z + "/" + x + "/" + y, tile);
      }
    }
    evictToCapacity();
  };

  const schedule = () => {
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
    for (const tile of warm.values()) {
      tile.release();
    }
    warm.clear();
  };
}
