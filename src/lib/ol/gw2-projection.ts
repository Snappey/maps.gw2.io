import {addProjection, Projection} from "ol/proj";
import TileGrid from "ol/tilegrid/TileGrid";
import {Extent} from "ol/extent";
import {Coordinate} from "ol/coordinate";

/**
 * GW2 "continent coordinates" are pixel coordinates at the maximum native tile
 * zoom, origin top-left, Y increasing downwards. OpenLayers is Y-up, so the
 * convention throughout the OL stack is: OL coordinate = [x_px, -y_px].
 * Always convert through gw2ToOl/olToGw2 — never inline the sign flip.
 */
export interface Gw2MapConfig {
  code: string;
  continentId: 1 | 2;
  floorId: number;
  /** World size in continent pixels (continent px == screen px at maxZoom). */
  width: number;
  height: number;
  /**
   * The sub-rectangle of the `width`x`height` continent that actually has tiles
   * on the GW2 tile server, as `[[minX, minY], [maxX, maxY]]` in continent
   * pixels (Y-down, exactly the GW2 floor API's `clamped_view`). The band around
   * this box is void and every tile in it 404s, so the view is constrained to it
   * (no panning into the void) and the tile grid is built from it (renderer and
   * prefetch never address a 404 tile). Omit to fall back to the full continent.
   */
  clampedView?: [[number, number], [number, number]];
  /**
   * Deepest zoom with native raster tiles. For Tyria this equals maxZoom; for
   * the Mists the tile pyramid stops at 6 (32x32 tiles of 512 continent px)
   * while coordinates and the view are scaled to zoom 7 — tiles overzoom 2x at
   * maxZoom, exactly like the old Leaflet maxNativeZoom setup.
   */
  maxNativeZoom: number;
  minZoom: number;
  /**
   * Coordinate/fragment scale base (2^maxZoom) AND the deepest zoom with crisp
   * 1:1 raster — NOT necessarily the deepest view zoom (see maxViewZoom).
   */
  maxZoom: number;
  /**
   * Deepest VIEW zoom the user can reach. Defaults to maxZoom. Set higher to
   * allow overzoom past the tile pyramid: the view keeps zooming and OL upscales
   * the deepest native tiles (resolution drops below 1, e.g. 0.5 at maxZoom+1).
   * Only the resolutions array grows — the coordinate scale stays 2^maxZoom, so
   * shared "#lat,lng,zoom" links and PMTiles addressing are unaffected.
   */
  maxViewZoom?: number;
  /** XYZ template, {z}/{x}/{y}; subdomain list expanded by the raster source. */
  tileUrl: string;
  attribution: string;
}

/**
 * GW2 tile service XYZ template for a given continent + floor. Continent 1
 * (Tyria) serves from four subdomains (tiles1..tiles4); the Mists continent
 * only has the bare `tiles` host. The floor is part of the path, so swapping it
 * is the only thing a dynamic floor change needs to vary.
 */
export const tileUrlFor = (continentId: number, floorId: number): string =>
  continentId === 1
    ? `https://tiles{1-4}.guildwars2.com/${continentId}/${floorId}/{z}/{x}/{y}.jpg`
    : `https://tiles.guildwars2.com/${continentId}/${floorId}/{z}/{x}/{y}.jpg`;

export const TYRIA_MAP_CONFIG: Gw2MapConfig = {
  code: "GW2:TYRIA",
  continentId: 1,
  floorId: 1,
  width: 81920,
  height: 114688,
  clampedView: [[0, 9000], [81920, 111000]],
  maxNativeZoom: 7,
  minZoom: 2,
  maxZoom: 7,
  maxViewZoom: 8,
  tileUrl: tileUrlFor(1, 1),
  attribution: '<a href="https://www.arena.net/">ArenaNet</a> / <a href="https://wiki.guildwars2.com">Guild Wars 2 Wiki</a>',
};

export const MISTS_MAP_CONFIG: Gw2MapConfig = {
  code: "GW2:MISTS",
  continentId: 2,
  floorId: 1,
  width: 16384,
  height: 16384,
  clampedView: [[0, 4094], [16382, 16382]],
  maxNativeZoom: 6,
  minZoom: 4,
  maxZoom: 7,
  maxViewZoom: 8,
  tileUrl: tileUrlFor(2, 1),
  attribution: '<a href="https://www.arena.net/">ArenaNet</a> / <a href="https://gw2timer.com/wvw">Gw2Timer</a>',
};

export const gw2ToOl = (coords: [number, number] | Coordinate): Coordinate =>
  [coords[0], -coords[1]];

export const olToGw2 = (coords: Coordinate): [number, number] =>
  [coords[0], -coords[1]];

export const getExtent = (config: Gw2MapConfig): Extent =>
  [0, -config.height, config.width, 0];

/**
 * The extent the view and tile grid are constrained to: the `clampedView` box
 * (where tiles actually exist) when set, otherwise the full continent rectangle.
 * Constraining to this is what stops panning into — and tile-requesting in — the
 * void band around the map that 404s. GW2's `clampedView` is Y-down continent
 * px; OL is Y-up, so min/max Y flip sign (extent = [minX, -maxY, maxX, -minY]).
 */
export const getClampedExtent = (config: Gw2MapConfig): Extent => {
  if (!config.clampedView) {
    return getExtent(config);
  }
  const [[minX, minY], [maxX, maxY]] = config.clampedView;
  return [minX, -maxY, maxX, -minY];
};

/**
 * resolutions[z] = 2^(maxZoom - z), so OL view zoom N == Leaflet zoom N. The
 * array runs to maxViewZoom (>= maxZoom): entries past maxZoom have resolution
 * < 1 (e.g. 0.5 at z = maxZoom + 1), which is what lets the view overzoom the
 * tile pyramid. The scale base stays maxZoom, so existing zoom levels are
 * byte-for-byte identical — only deeper levels are appended.
 */
export const getResolutions = (config: Gw2MapConfig): number[] =>
  Array.from({length: (config.maxViewZoom ?? config.maxZoom) + 1}, (_, z) => 2 ** (config.maxZoom - z));

const projectionCache = new Map<string, Projection>();

/**
 * One shared, registered Projection instance per map config — OL treats two
 * instances with the same code as different projections, so view and sources
 * must reference the same object.
 */
export const getProjection = (config: Gw2MapConfig): Projection => {
  let projection = projectionCache.get(config.code);
  if (!projection) {
    projection = new Projection({
      code: config.code,
      units: "pixels",
      extent: getExtent(config),
    });
    addProjection(projection);
    projectionCache.set(config.code, projection);
  }
  return projection;
};

export const createTileGrid = (config: Gw2MapConfig): TileGrid =>
  new TileGrid({
    // Clamped to where tiles exist, so getFullTileRange (and thus the renderer's
    // withinExtentAndZ check and the prefetch's grid-extent clamp) never address
    // a void tile that would 404.
    extent: getClampedExtent(config),
    origin: [0, 0], // top-left; OL tile y increases downwards, matching GW2's scheme
    // Native raster tiles only exist down to maxNativeZoom; OL overzooms beyond.
    resolutions: getResolutions(config).slice(0, config.maxNativeZoom + 1),
    tileSize: 256,
  });

/**
 * PMTiles only addresses the standard square pyramid (x,y < 2^z) while the GW2
 * grid is wider (320x448 tiles at Tyria z7), so generate_tiles.mjs stores tiles
 * at PMTiles z + VECTOR_TILE_ZOOM_OFFSET. This grid exposes those zooms with
 * matching resolutions, so the source requests the right PMTiles IDs while view
 * zoom semantics stay identical.
 */
export const VECTOR_TILE_ZOOM_OFFSET = 2;

export const createVectorTileGrid = (config: Gw2MapConfig): TileGrid =>
  new TileGrid({
    extent: getExtent(config),
    origin: [0, 0],
    resolutions: Array.from(
      {length: config.maxZoom + VECTOR_TILE_ZOOM_OFFSET + 1},
      (_, z) => 2 ** (config.maxZoom + VECTOR_TILE_ZOOM_OFFSET - z)),
    tileSize: 256,
    minZoom: VECTOR_TILE_ZOOM_OFFSET,
  });

/**
 * URL fragments keep the Leaflet CRS.Simple format "#lat,lng,zoom" so links
 * shared from the old map keep working: lat = -y / 2^maxNativeZoom, lng = x / 2^maxNativeZoom.
 */
export const fragmentToView = (fragment: string, config: Gw2MapConfig): {center: Coordinate, zoom: number} | undefined => {
  const parts = fragment.split(",").map(p => parseFloat(p));
  if (parts.length !== 3 || parts.some(p => !isFinite(p))) {
    return undefined;
  }
  const [lat, lng, zoom] = parts;
  const scale = 2 ** config.maxZoom;
  return {center: gw2ToOl([lng * scale, -lat * scale]), zoom};
};

export const viewToFragment = (center: Coordinate, zoom: number, config: Gw2MapConfig): string => {
  const [x, y] = olToGw2(center);
  const scale = 2 ** config.maxZoom;
  // Zoom may be fractional on maps without resolution constraint (Mists).
  return [Math.round(-y / scale), Math.round(x / scale), Math.round(zoom * 100) / 100].join(",");
};
