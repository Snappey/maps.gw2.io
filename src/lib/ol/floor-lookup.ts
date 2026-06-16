import {MapFloorInfo} from "../../services/map.service";

/** The base floor every map shares; the raster falls back here off-map or when
 * a chosen floor isn't valid for the map the view moved onto. */
export const DEFAULT_FLOOR = 1;

/** Map `type`s the core (Tyria) floor picker offers: open-world maps only.
 *  Dungeon/story `Instance`s (and `Pvp` maps) overlap public continent_rects
 *  and would otherwise hijack the picker, so they're excluded. */
export const CORE_FLOOR_MAP_TYPES: readonly string[] = ["Public"];

/** Map `type`s the Mists (WvW) floor picker offers. WvW maps aren't typed
 *  "Public", but their floors (e.g. Eternal Battlegrounds' lower level) are
 *  real, so they're kept; this drops the Fractals/SAB/PvP maps that also sit on
 *  the Mists continent. */
export const MISTS_FLOOR_MAP_TYPES: readonly string[] = [
  "Center", "RedHome", "BlueHome", "GreenHome", "EdgeOfTheMists",
];

/** What the floating floor picker renders for the map currently under the view. */
export interface FloorPickerState {
  mapName: string;
  /** Floors the current map supports (continent-global ids), ascending. */
  floors: number[];
  defaultFloor: number;
  /** Floor the raster is currently showing. */
  selected: number;
}

/**
 * The map that occupies the most of the current viewport on the given
 * continent. Using visible area rather than just the view center is robust near
 * map borders, where the center can land in a thin sliver of a neighbouring map
 * while the screen is dominated by another. `viewRect` is `[minX, minY, maxX,
 * maxY]` in GW2 continent pixels. Ties (e.g. nested maps that both fully cover
 * the view) go to the smaller map — the more specific one. Returns undefined
 * when the view overlaps no map (e.g. open ocean). When `allowedTypes` is given,
 * maps whose `type` isn't in it are skipped (see CORE/MISTS_FLOOR_MAP_TYPES) so
 * an overlapping dungeon instance doesn't shadow the public map underneath.
 */
export function findDominantMap(
  maps: MapFloorInfo[],
  continentId: number,
  viewRect: [number, number, number, number],
  allowedTypes?: ReadonlySet<string>,
): MapFloorInfo | undefined {
  const [vMinX, vMinY, vMaxX, vMaxY] = viewRect;
  let best: MapFloorInfo | undefined;
  let bestOverlap = 0;
  let bestArea = Infinity;
  for (const m of maps) {
    if (m.continent_id !== continentId || !m.continent_rect
        || (allowedTypes && !allowedTypes.has(m.type))) {
      continue;
    }
    const [[minX, minY], [maxX, maxY]] = m.continent_rect;
    const overlapX = Math.min(vMaxX, maxX) - Math.max(vMinX, minX);
    const overlapY = Math.min(vMaxY, maxY) - Math.max(vMinY, minY);
    if (overlapX <= 0 || overlapY <= 0) {
      continue;
    }
    const overlap = overlapX * overlapY;
    const area = (maxX - minX) * (maxY - minY);
    if (overlap > bestOverlap || (overlap === bestOverlap && area < bestArea)) {
      best = m;
      bestOverlap = overlap;
      bestArea = area;
    }
  }
  return best;
}

/**
 * Offer-only floor resolution: a non-default `selected` floor "sticks" only
 * while the map under the view still supports it, then quietly reverts to the
 * base floor once the view moves off the map it was picked on.
 */
export function resolveFloor(map: MapFloorInfo | undefined, selected: number): number {
  if (selected === DEFAULT_FLOOR) {
    return DEFAULT_FLOOR;
  }
  return map?.floors?.includes(selected) ? selected : DEFAULT_FLOOR;
}
