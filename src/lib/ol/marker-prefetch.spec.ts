/**
 * Guard tests for marker-prefetch's reliance on OpenLayers' VectorTile tile
 * lifecycle. The warm/release scheme leans on two behaviors that are NOT part of
 * OL's documented public API (see the brittleness note in marker-prefetch.ts):
 *   1. source.getTile() returns a fresh, renderer-unmanaged tile the caller owns;
 *   2. tile.release() is a refcount decrement safe to call from app code, and
 *      frees a source tile only once no other render tile references it.
 * If an OL upgrade breaks either, warmed markers silently flicker in production.
 * These specs pin the behavior so the upgrade fails CI instead.
 */
import OlMap from "ol/Map";
import View from "ol/View";
import Projection from "ol/proj/Projection";
import TileGrid from "ol/tilegrid/TileGrid";
import TileState from "ol/TileState";
import VectorTileSource from "ol/source/VectorTile";
import {attachMarkerPrefetch, WARM_CAPACITY} from "./marker-prefetch";
import {DEBOUNCE_MS} from "./tile-prefetch";

// A source-tile load that records every parse and resolves synchronously, so a
// tile flips IDLE -> LOADED without real network/MVT work. The parse count is how
// the specs observe whether OL re-parsed (cache miss) or reused (cache hit).
type LoadCounts = Record<string, number>;

// Structural view of the source tile passed to tileLoadFunction (ol/VectorTile is
// generic over its feature type, which is irrelevant here — we set no features).
type SourceTile = {getTileCoord(): number[]; setFeatures(features: unknown[]): void};

function countingSource(projection: Projection, tileGrid: TileGrid, counts: LoadCounts): VectorTileSource {
  return new VectorTileSource({
    projection,
    tileGrid,
    wrapX: false,
    tileUrlFunction: coord => coord.join("/"),
    tileLoadFunction: tile => {
      const sourceTile = tile as unknown as SourceTile;
      const key = sourceTile.getTileCoord().join("/");
      counts[key] = (counts[key] ?? 0) + 1;
      sourceTile.setFeatures([]);
    },
  });
}

// Resident parsed source tiles. Intentionally reaches into the private field the
// warm/release scheme depends on, so an OL rename/refactor trips these specs.
const residentCount = (source: VectorTileSource): number =>
  Object.keys((source as unknown as {sourceTiles_: object}).sourceTiles_).length;

describe("marker-prefetch OL tile-lifecycle contract", () => {
  const projection = new Projection({code: "marker-prefetch-test", units: "pixels", extent: [0, 0, 1024, 1024]});
  // origin is the top-left corner [minX, maxY]; OL's tile math grows y downward.
  const tileGrid = new TileGrid({extent: [0, 0, 1024, 1024], origin: [0, 1024], resolutions: [4, 2, 1], tileSize: 256});
  let counts: LoadCounts;
  let source: VectorTileSource;

  beforeEach(() => {
    counts = {};
    source = countingSource(projection, tileGrid, counts);
  });

  it("getTile().load() parses a source tile once and reuses it", () => {
    const tile = source.getTile(2, 1, 1, 1, projection);
    expect(tile.getState()).toBe(TileState.IDLE);
    tile.load();
    expect(counts["2/1/1"]).toBe(1);

    // A second render tile for the same coord reuses the parsed source tile.
    source.getTile(2, 1, 1, 1, projection).load();
    expect(counts["2/1/1"]).toBe(1);
  });

  it("release() keeps source tiles another render tile still references", () => {
    // The contract that, if OL breaks it, makes warmed markers flicker: releasing
    // a prefetch tile must NOT evict a source tile the renderer also holds.
    const warm = source.getTile(2, 1, 1, 1, projection);
    warm.load();
    const renderer = source.getTile(2, 1, 1, 1, projection);
    renderer.load();
    expect(counts["2/1/1"]).toBe(1);

    warm.release();

    source.getTile(2, 1, 1, 1, projection).load();
    expect(counts["2/1/1"]).toBe(1); // survived: no re-parse
  });

  it("release() frees a source tile once it is the only holder", () => {
    const warm = source.getTile(2, 0, 0, 1, projection);
    warm.load();
    expect(counts["2/0/0"]).toBe(1);

    warm.release();

    source.getTile(2, 0, 0, 1, projection).load();
    expect(counts["2/0/0"]).toBe(2); // freed, so re-parsed
  });
});

describe("attachMarkerPrefetch lifecycle", () => {
  // A dense single-zoom grid (256x256 tiles) so a handful of gestures warm more
  // than WARM_CAPACITY tiles and exercise eviction.
  const projection = new Projection({code: "marker-prefetch-map", units: "pixels", extent: [0, 0, 8192, 8192]});
  const tileGrid = new TileGrid({extent: [0, 0, 8192, 8192], origin: [0, 8192], resolutions: [1], tileSize: 32, minZoom: 0});
  let counts: LoadCounts;
  let source: VectorTileSource;
  let map: OlMap;
  let teardown: () => void;

  // Pan to a fresh x-band, then let the debounced warm pass run.
  const pan = (x: number) => {
    map.getView().setCenter([x, 4096]);
    map.dispatchEvent("moveend");
    jasmine.clock().tick(DEBOUNCE_MS);
  };

  beforeEach(() => {
    jasmine.clock().install();
    counts = {};
    source = countingSource(projection, tileGrid, counts);
    map = new OlMap({
      view: new View({projection, resolutions: [1], center: [4096, 4096], zoom: 0}),
      controls: [],
      interactions: [],
    });
    map.setSize([512, 512]);
    teardown = attachMarkerPrefetch(map, source);
  });

  afterEach(() => {
    teardown(); // idempotent: safe even when a test already tore down
    map.setTarget(undefined);
    jasmine.clock().uninstall();
  });

  it("bounds the resident set under eviction across many gestures", () => {
    // Bands spaced wider than the buffered ring so each pass warms fresh tiles.
    [1024, 2304, 3584, 4864, 6144, 7424].forEach(pan);

    // Far more distinct tiles were parsed over time than remain resident...
    expect(Object.keys(counts).length).toBeGreaterThan(WARM_CAPACITY);
    // ...because eviction release()d the oldest past the cap.
    expect(residentCount(source)).toBeGreaterThan(0);
    expect(residentCount(source)).toBeLessThanOrEqual(WARM_CAPACITY);
  });

  it("teardown releases every warmed tile and stops warming", () => {
    pan(2048);
    expect(residentCount(source)).toBeGreaterThan(0);

    teardown();
    expect(residentCount(source)).toBe(0); // all released (no renderer holds this source)

    // Listeners detached: a later gesture warms nothing.
    pan(6144);
    expect(residentCount(source)).toBe(0);
  });
});
