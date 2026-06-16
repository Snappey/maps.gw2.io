import OlMap from "ol/Map";
import {EventsKey} from "ol/events";
import {unByKey} from "ol/Observable";
import {Gw2MapConfig} from "./gw2-projection";
import {DEFAULT_FLOOR, findDominantMap, FloorPickerState, resolveFloor} from "./floor-lookup";
import {MapFloorInfo} from "../../services/map.service";

/**
 * Floors are deep-zoom detail (vertical levels of a single map), so the picker
 * only appears once the view is zoomed in this far — at overview zooms many
 * maps share the screen and a floor choice has no clear target.
 */
const MIN_FLOOR_PICKER_ZOOM = 6;

/**
 * Drives the dynamic raster floor: watches the view, resolves the map under the
 * center to its available floors, and surfaces them to the picker. Owns the
 * "offer-only, revert to 1" selection lifecycle (see resolveFloor) — a plain
 * controller in the style of LabelOverlays / OlLiveMarkersController, no DI.
 */
export class FloorController {
  /** Floor the raster currently shows; DEFAULT_FLOOR unless the user overrode it. */
  private selected = DEFAULT_FLOOR;
  private readonly moveKey: EventsKey;
  /** Map `type`s the picker may resolve to; other maps under the view are
   *  ignored (e.g. CORE_FLOOR_MAP_TYPES / MISTS_FLOOR_MAP_TYPES). */
  private readonly allowedTypes: ReadonlySet<string>;

  constructor(
    private readonly olMap: OlMap,
    private readonly config: Gw2MapConfig,
    private readonly maps: MapFloorInfo[],
    allowedTypes: readonly string[],
    /** Swap the raster to this floor (rebuilds the base layer). */
    private readonly onFloorChange: (floorId: number) => void,
    /** Push picker state to the UI; null hides the picker. */
    private readonly onState: (state: FloorPickerState | null) => void,
  ) {
    this.allowedTypes = new Set(allowedTypes);
    this.moveKey = this.olMap.on("moveend", () => this.update());
    this.update();
  }

  /** User picked a floor from the picker — it belongs to the current map. */
  selectFloor(floorId: number): void {
    if (floorId === this.selected) {
      return;
    }
    this.selected = floorId;
    this.onFloorChange(floorId);
    this.update();
  }

  private update(): void {
    const view = this.olMap.getView();
    const size = this.olMap.getSize();
    const zoom = view.getZoom();
    if (!size || zoom === undefined) {
      return;
    }
    // OL extent is [minX, minY, maxX, maxY]; flip Y to GW2 continent px.
    const ext = view.calculateExtent(size);
    const viewRect: [number, number, number, number] = [ext[0], -ext[3], ext[2], -ext[1]];
    const map = findDominantMap(this.maps, this.config.continentId, viewRect, this.allowedTypes);

    // Revert to floor 1 when the view moves onto a map that can't show the
    // overridden floor (selectFloor handles the forward direction). Runs at
    // every zoom so the raster stays consistent even while the picker is hidden.
    const resolved = resolveFloor(map, this.selected);
    if (resolved !== this.selected) {
      this.selected = resolved;
      this.onFloorChange(resolved);
    }

    if (zoom >= MIN_FLOOR_PICKER_ZOOM && map && map.floors.length > 1) {
      this.onState({
        mapName: map.name,
        floors: [...map.floors].sort((a, b) => a - b),
        defaultFloor: map.default_floor,
        selected: this.selected,
      });
    } else {
      this.onState(null);
    }
  }

  destroy(): void {
    unByKey(this.moveKey);
  }
}
