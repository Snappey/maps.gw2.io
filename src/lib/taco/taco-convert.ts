/**
 * Converts GW2 world coordinates (as stored in TacO marker files) into the
 * continent-pixel coordinates the maps use (the same space as
 * `UserFeature.geometry.coordinates`; `gw2ToOl` is applied downstream).
 *
 * A world position is in **metres** (raw MumbleLink units, as TacO records
 * them): x is east-west, z is north-south, y is height (ignored). `map_rect` is
 * the map's world bounds in **inches** with Y increasing **north**, so we scale
 * metres → inches first. `continent_rect` is its pixel bounds with Y increasing
 * **south** (origin top-left), so the continent Y axis is inverted relative to
 * the map's north-up Z axis — this is the canonical GW2 Mumble→continent
 * conversion. See the implementation plan for the derivation.
 */

import {TacoPoi, TacoTrail} from "./taco-parse";

/** GW2 game units are inches; MumbleLink/TacO positions are metres. */
const INCHES_PER_METRE = 39.3701;

export interface MapRectInfo {
  continent_id: number;
  map_rect: number[][];
  continent_rect: number[][];
}

/** One world (x, z) in metres → continent pixel, for a single map's rects. */
export function worldToContinent(x: number, z: number, info: MapRectInfo): [number, number] {
  const mapX = x * INCHES_PER_METRE;
  const mapZ = z * INCHES_PER_METRE;
  const [[swX, swY], [neX, neY]] = info.map_rect;
  const [[nwX, nwY], [seX, seY]] = info.continent_rect;

  const fracX = (mapX - swX) / (neX - swX); // 0 west .. 1 east
  const fracZ = (mapZ - swY) / (neY - swY); // 0 south .. 1 north

  const continentX = nwX + fracX * (seX - nwX);
  // continent Y grows south while map Z grows north — the inversion is carried
  // by (nwY - seY) being negative (north pixel-Y < south pixel-Y).
  const continentY = seY + fracZ * (nwY - seY);
  return [continentX, continentY];
}

/** Places a POI, or undefined if its MapID is unknown. */
export function placePoi(
  poi: TacoPoi,
  maps: Map<number, MapRectInfo>,
): {coord: [number, number]; continentId: number} | undefined {
  const info = maps.get(poi.mapId);
  if (!info) {
    return undefined;
  }
  return {coord: worldToContinent(poi.x, poi.z, info), continentId: info.continent_id};
}

/** Places a trail's vertices, or undefined if its MapID is unknown. */
export function placeTrail(
  trail: TacoTrail,
  maps: Map<number, MapRectInfo>,
): {points: [number, number][]; continentId: number} | undefined {
  const info = maps.get(trail.mapId);
  if (!info) {
    return undefined;
  }
  return {
    points: trail.points.map(p => worldToContinent(p.x, p.z, info)),
    continentId: info.continent_id,
  };
}
