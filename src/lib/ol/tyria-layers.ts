import {Feature} from "ol";
import {FeatureLike} from "ol/Feature";
import Point from "ol/geom/Point";
import VectorSource from "ol/source/Vector";
import VectorTile from "ol/source/VectorTile";
import {Fill, Stroke, Style} from "ol/style";
import {StyleLike} from "ol/style/Style";
import {LayerState} from "../layer-state";
import {gw2ToOl} from "./gw2-projection";
import {LayerDefinition} from "./layer-registry";
import {iconStyle, labelStyle, localIconSrc, masteryIcon} from "./marker-styles";
import {forSourceLayer} from "./feature-meta";

/**
 * One icon kind inside the merged marker layer. The panel still shows one
 * toggle per kind (a stub layer registered under `id`); the merged layer's
 * style function consults that stub's state per feature.
 */
export interface MarkerSublayer {
  id: string;
  sourceLayer: string;
  /** Stacking inside the merged layer; replaces the old registration order. */
  zIndex: number;
  minZoomLevel?: number;
  friendlyName: string;
  icon: string;
  state: LayerState;
  style: (feature: FeatureLike) => Style | undefined;
}

/**
 * The icon overlays, merged into ONE vector-tile layer at render time. A layer
 * per kind cost a separate canvas + per-frame render pass and re-scanned every
 * feature of every shared source tile — the dominant zoom/pan cost in dense
 * areas (see gw2ZoomBench). Ids, zoom thresholds and panel behaviour unchanged.
 */
export const TYRIA_MARKER_SUBLAYERS: MarkerSublayer[] = [
  {
    id: "waypoints", sourceLayer: "waypoint", zIndex: 0, minZoomLevel: 5,
    friendlyName: "Waypoints", icon: "/assets/waypoint.png", state: LayerState.Enabled,
    style: () => iconStyle("assets/waypoint.png", 32, 0),
  },
  {
    id: "landmarks", sourceLayer: "poi", zIndex: 1, minZoomLevel: 6,
    friendlyName: "Points of Interest", icon: "/assets/poi.png", state: LayerState.Enabled,
    style: () => iconStyle("assets/poi.png", 32, 1),
  },
  {
    id: "vista", sourceLayer: "vista", zIndex: 2, minZoomLevel: 6,
    friendlyName: "Vistas", icon: "/assets/vista.png", state: LayerState.Enabled,
    style: () => iconStyle("assets/vista.png", 32, 2),
  },
  {
    id: "unlocks", sourceLayer: "unlock", zIndex: 3, minZoomLevel: 4,
    friendlyName: "Instanced Content", icon: "/assets/commander_blue.png", state: LayerState.Enabled,
    style: f => iconStyle(localIconSrc(f.get("icon") || "assets/poi.png"), 32, 3),
  },
  {
    id: "heart_labels", sourceLayer: "heart", zIndex: 4, minZoomLevel: 6,
    friendlyName: "Hearts", icon: "/assets/hearts.png", state: LayerState.Enabled,
    style: () => iconStyle("assets/hearts.png", 32, 4),
  },
  {
    id: "heropoint_labels", sourceLayer: "heropoint", zIndex: 5, minZoomLevel: 6,
    friendlyName: "Hero Points", icon: "/assets/heropoint.png", state: LayerState.Enabled,
    style: () => iconStyle("assets/heropoint.png", 32, 5),
  },
  {
    id: "masteries_labels", sourceLayer: "mastery", zIndex: 6, minZoomLevel: 6,
    friendlyName: "Masteries", icon: "/assets/core_mastery.png", state: LayerState.Enabled,
    style: f => iconStyle(masteryIcon(f.get("region")), 32, 6),
  },
  {
    id: "adventure_labels", sourceLayer: "adventure", zIndex: 7, minZoomLevel: 6,
    friendlyName: "Adventures", icon: "/assets/adventure_icon.png", state: LayerState.Enabled,
    style: () => iconStyle("assets/adventure_icon.png", 32, 7),
  },
  {
    id: "city_markers", sourceLayer: "city", zIndex: 8, minZoomLevel: 7,
    friendlyName: "City Markers", icon: "/assets/portal_icon.png", state: LayerState.Enabled,
    style: f => f.get("icon") ? iconStyle(localIconSrc(f.get("icon")), 24, 8) : undefined,
  },
];

/**
 * Mirrors BaseOlMap.applyState's zoom semantics for one sublayer (OL layer
 * min/max zoom is exclusive-at-min: visible while zoom > min - 0.5).
 */
export function sublayerVisible(sub: MarkerSublayer, state: LayerState, zoom: number): boolean {
  switch (state) {
    case LayerState.Disabled:
      return false;
    case LayerState.Pinned:
      // Pinned kinds are drawn at every zoom by a full, non-tiled overlay the
      // component owns (the vector tiles carry no geometry below a kind's
      // display zoom). The merged tiled layer must NOT draw them too, or they
      // double up in the kind's normal zoom range. See loadPinFeatures /
      // syncPinOverlay in tyria-ol-map.component.ts.
      return false;
    default:
      return sub.minZoomLevel === undefined || zoom > sub.minZoomLevel - 0.5;
  }
}

/**
 * Style function for the merged marker layer. NOTE: vector-tile styles are
 * baked into render tiles, not re-evaluated per frame — the owning component
 * must call layer.changed() when a sublayer's state or zoom-range visibility
 * flips (see syncMarkerVisibility in tyria-ol-map.component.ts).
 */
export function mergedMarkerStyle(maxZoom: number, getState: (id: string) => LayerState): StyleLike {
  const bySourceLayer = new Map(TYRIA_MARKER_SUBLAYERS.map(s => [s.sourceLayer, s]));
  return (feature, resolution) => {
    const sub = bySourceLayer.get(feature.get("layer"));
    if (!sub || !sublayerVisible(sub, getState(sub.id), maxZoom - Math.log2(resolution))) {
      return undefined;
    }
    return sub.style(feature);
  };
}

// --- Pin overlay -------------------------------------------------------------
// A pinned kind must show at EVERY zoom, but the PMTiles only carry a kind's
// geometry within its display-zoom range (see generate_tiles.mjs). So when a
// kind is pinned the component renders its full feature set from these JSON
// assets in a non-tiled overlay instead. The builders below mirror
// collectTyriaFeatures in generate_tiles.mjs, tagging each feature with the
// same `layer` and props the vector tiles carry so the merged style, tooltips,
// wiki links and chat-link copy all keep working unchanged.

/** Which src/assets/data file a pinnable marker kind loads its full set from. */
export const PIN_SOURCE: {[id: string]: "poi" | "adventure" | "city"} = {
  waypoints: "poi", landmarks: "poi", vista: "poi", unlocks: "poi",
  heart_labels: "poi", heropoint_labels: "poi", masteries_labels: "poi",
  adventure_labels: "adventure", city_markers: "city",
};

interface PoiPinLabel {
  id: string | number;
  coordinates?: [number, number];
  type: string;
  data?: {tooltip?: string; chat_link?: string; icon?: string; type?: string};
}
interface AdventurePinLabel {
  id: string | number;
  coordinates?: [number, number];
  data?: {tooltip?: string; url?: string};
}
interface CityPinLabel {
  coord?: [number, number];
  name?: string;
  text?: string;
  icon?: string;
}

const pinFeature = (sourceLayer: string, coords: [number, number], props: object): Feature<Point> => {
  const feature = new Feature({geometry: new Point(gw2ToOl(coords))});
  feature.setProperties({layer: sourceLayer, ...props});
  return feature;
};

/** Full feature sets, per sublayer id, for the seven poi_labels-derived kinds. */
export function buildPoiPinFeatures(raw: PoiPinLabel[]): Map<string, Feature<Point>[]> {
  const out = new Map<string, Feature<Point>[]>(
    ["waypoints", "landmarks", "vista", "unlocks", "heart_labels", "heropoint_labels", "masteries_labels"]
      .map((id): [string, Feature<Point>[]] => [id, []]));
  for (const label of raw) {
    if (!label.coordinates) continue;
    const d = label.data ?? {};
    const c = label.coordinates;
    switch (label.type) {
      case "waypoint":
        out.get("waypoints")!.push(pinFeature("waypoint", c, {id: label.id, tooltip: d.tooltip ?? "", chat_link: d.chat_link ?? ""}));
        break;
      case "landmark":
        out.get("landmarks")!.push(pinFeature("poi", c, {id: label.id, tooltip: d.tooltip ?? "", chat_link: d.chat_link ?? ""}));
        break;
      case "vista":
        out.get("vista")!.push(pinFeature("vista", c, {id: label.id, chat_link: d.chat_link ?? ""}));
        break;
      case "unlock":
        out.get("unlocks")!.push(pinFeature("unlock", c, {id: label.id, tooltip: d.tooltip ?? "", chat_link: d.chat_link ?? "", icon: d.icon ?? ""}));
        break;
      case "heart":
        out.get("heart_labels")!.push(pinFeature("heart", c, {id: label.id, tooltip: d.tooltip ?? "", chat_link: d.chat_link ?? ""}));
        break;
      case "skillpoint":
        out.get("heropoint_labels")!.push(pinFeature("heropoint", c, {id: String(label.id)}));
        break;
      case "mastery":
        out.get("masteries_labels")!.push(pinFeature("mastery", c, {id: label.id, region: d.type ?? "Tyria"}));
        break;
    }
  }
  return out;
}

export function buildAdventurePinFeatures(raw: AdventurePinLabel[]): Feature<Point>[] {
  return raw
    .filter((l): l is AdventurePinLabel & {coordinates: [number, number]} => !!l.coordinates)
    .map(l => pinFeature("adventure", l.coordinates, {name: String(l.id), tooltip: l.data?.tooltip ?? "", url: l.data?.url ?? ""}));
}

export function buildCityPinFeatures(raw: CityPinLabel[]): Feature<Point>[] {
  return raw
    .filter((l): l is CityPinLabel & {coord: [number, number]} => !!l.coord)
    .map(l => pinFeature("city", l.coord, {name: (l.text ?? l.name ?? "").replaceAll(/([\[\]])*/g, ""), icon: l.icon ?? ""}));
}

/**
 * The non-icon Tyria overlays sharing the PMTiles source, plus one panel-stub
 * layer per marker sublayer (the icons themselves render in the merged layer
 * the component owns). Ids, zoom thresholds and opacity tables match the
 * Leaflet registrations in tyria-map.component.ts so the layer panel behaves
 * identically.
 */
export function createTyriaOverlayDefinitions(source: VectorTile): LayerDefinition[] {
  return [
    ...TYRIA_MARKER_SUBLAYERS.map((sub): LayerDefinition => ({
      kind: "vector", id: sub.id, source: new VectorSource(),
      minZoomLevel: sub.minZoomLevel,
      friendlyName: sub.friendlyName, icon: sub.icon, state: sub.state, zIndex: 2,
    })),
    // The heading layers are visibility stubs for the layer panel: the text
    // itself is drawn by the LabelOverlays SVG, which follows their
    // visibility. A vector-tile layer here would process every label tile on
    // every rendered frame just to draw nothing.
    {
      kind: "vector", id: "region_labels", source: new VectorSource(),
      minZoomLevel: 2, maxZoomLevel: 5, opacityLevels: {5: .2, 4: .6},
      friendlyName: "Region Headings", icon: "/assets/list_icon.png", state: LayerState.Enabled, zIndex: 3,
    },
    {
      kind: "vector", id: "map_labels", source: new VectorSource(),
      minZoomLevel: 3, maxZoomLevel: 5, opacityLevels: {5: .7},
      friendlyName: "Map Headings", icon: "/assets/list_icon.png", state: LayerState.Enabled, zIndex: 3,
    },
    {
      kind: "vector-tile", id: "sector_headings", source, sourceLayer: "label_sector", declutter: "labels",
      style: forSourceLayer("label_sector", f => labelStyle("sector", f.get("tooltip") ?? "")),
      minZoomLevel: 7, friendlyName: "Sector Headings", icon: "/assets/list_icon.png", state: LayerState.Enabled, zIndex: 3,
    },
    {
      kind: "vector-tile", id: "sector_polygons", source, sourceLayer: "sector_bounds",
      style: forSourceLayer("sector_bounds", () => SECTOR_BOUNDS_STYLE),
      minZoomLevel: 7, friendlyName: "Sector Outlines", icon: "/assets/list_icon.png", state: LayerState.Disabled, zIndex: 1,
    },
  ];
}

const SECTOR_BOUNDS_STYLE = new Style({
  stroke: new Stroke({color: "rgba(255, 255, 255, 0.7)", width: 2}),
});

export const HEART_BOUNDS_STYLE = new Style({
  stroke: new Stroke({color: "rgba(255, 255, 0, 0.7)", width: 3}),
  fill: new Fill({color: "rgba(255, 255, 0, 0.2)"}),
});

/** Structural subset of EventTimerService's Event, kept Leaflet-free. */
interface TimedEvent {
  timeUntil: number;
  name: string;
  meta?: string;
  chatLink: string;
  coordinates: [number, number];
}

/**
 * Upserts world-boss markers in place from a 15s timer tick; only events
 * starting within `showWithinMinutes` are shown (matches createEventsLayer).
 */
export function syncEventFeatures(
  source: VectorSource,
  events: {[xpac: string]: TimedEvent[]},
  showWithinMinutes: number = 30,
) {
  const seen = new Set<string>();
  for (const xpac of Object.keys(events)) {
    for (const event of events[xpac]) {
      if (event.timeUntil >= showWithinMinutes || !event.coordinates) {
        continue;
      }
      const id = `${xpac}|${event.meta ?? ""}|${event.name}`;
      seen.add(id);
      let feature = source.getFeatureById(id) as Feature<Point> | null;
      if (!feature) {
        feature = new Feature({geometry: new Point(gw2ToOl(event.coordinates))});
        feature.setId(id);
        source.addFeature(feature);
      }
      feature.setProperties({
        layer: "event",
        name: event.name,
        chat_link: event.chatLink,
        tooltip: `${event.name} - ${Math.round(event.timeUntil)} Minutes`,
      });
    }
  }
  for (const feature of source.getFeatures()) {
    if (!seen.has(feature.getId() as string)) {
      source.removeFeature(feature);
    }
  }
}
