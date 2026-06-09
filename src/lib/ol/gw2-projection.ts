import {Projection} from "ol/proj";
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
  continentId: number;
  floorId: number;
  /** World size in continent pixels at maxNativeZoom. */
  width: number;
  height: number;
  /** Maximum zoom with native tiles; continent px == screen px at this zoom. */
  maxNativeZoom: number;
  minZoom: number;
  maxZoom: number;
  /** XYZ template, {z}/{x}/{y}; subdomain list expanded by the raster source. */
  tileUrl: string;
  attribution: string;
}

export const TYRIA_MAP_CONFIG: Gw2MapConfig = {
  code: "GW2:TYRIA",
  continentId: 1,
  floorId: 1,
  width: 81920,
  height: 114688,
  maxNativeZoom: 7,
  minZoom: 2,
  maxZoom: 7,
  tileUrl: "https://tiles{1-4}.guildwars2.com/1/1/{z}/{x}/{y}.jpg",
  attribution: '<a href="https://www.arena.net/">ArenaNet</a>',
};

export const MISTS_MAP_CONFIG: Gw2MapConfig = {
  code: "GW2:MISTS",
  continentId: 2,
  floorId: 1,
  width: 16384,
  height: 16384,
  maxNativeZoom: 6,
  minZoom: 3,
  maxZoom: 7,
  tileUrl: "https://tiles.guildwars2.com/2/1/{z}/{x}/{y}.jpg",
  attribution: '<a href="https://www.arena.net/">ArenaNet</a> / <a href="https://gw2timer.com/wvw">Gw2Timer</a>',
};

export const gw2ToOl = (coords: [number, number] | Coordinate): Coordinate =>
  [coords[0], -coords[1]];

export const olToGw2 = (coords: Coordinate): [number, number] =>
  [coords[0], -coords[1]];

export const getExtent = (config: Gw2MapConfig): Extent =>
  [0, -config.height, config.width, 0];

/** resolutions[z] = 2^(maxNativeZoom - z), so OL view zoom N == Leaflet zoom N. */
export const getResolutions = (config: Gw2MapConfig): number[] =>
  Array.from({length: config.maxNativeZoom + 1}, (_, z) => 2 ** (config.maxNativeZoom - z));

export const createProjection = (config: Gw2MapConfig): Projection =>
  new Projection({
    code: config.code,
    units: "pixels",
    extent: getExtent(config),
  });

export const createTileGrid = (config: Gw2MapConfig): TileGrid =>
  new TileGrid({
    extent: getExtent(config),
    origin: [0, 0], // top-left; OL tile y increases downwards, matching GW2's scheme
    resolutions: getResolutions(config),
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
      {length: config.maxNativeZoom + VECTOR_TILE_ZOOM_OFFSET + 1},
      (_, z) => 2 ** (config.maxNativeZoom + VECTOR_TILE_ZOOM_OFFSET - z)),
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
  const scale = 2 ** config.maxNativeZoom;
  return {center: gw2ToOl([lng * scale, -lat * scale]), zoom};
};

export const viewToFragment = (center: Coordinate, zoom: number, config: Gw2MapConfig): string => {
  const [x, y] = olToGw2(center);
  const scale = 2 ** config.maxNativeZoom;
  return [Math.round(-y / scale), Math.round(x / scale), Math.round(zoom)].join(",");
};
