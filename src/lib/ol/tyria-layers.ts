import {Feature} from "ol";
import {FeatureLike} from "ol/Feature";
import Point from "ol/geom/Point";
import VectorSource from "ol/source/Vector";
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
  /** Panel category (collapsible header) this kind nests under. */
  group?: string[];
  style: (feature: FeatureLike) => Style | undefined;
}

/**
 * The icon overlays, merged into ONE vector layer at render time. A layer per
 * kind cost a separate canvas + per-frame render pass and re-scanned every
 * in-view feature — the dominant zoom/pan cost in dense areas (see gw2ZoomBench).
 */
export const TYRIA_MARKER_SUBLAYERS: MarkerSublayer[] = [
  {
    id: "waypoints", sourceLayer: "waypoint", zIndex: 0, minZoomLevel: 5,
    friendlyName: "Waypoints", icon: "/assets/waypoint.png", state: LayerState.Enabled, group: ["World Completion"],
    style: () => iconStyle("assets/waypoint.png", 32, 0),
  },
  {
    id: "landmarks", sourceLayer: "poi", zIndex: 1, minZoomLevel: 6,
    friendlyName: "Points of Interest", icon: "/assets/poi.png", state: LayerState.Enabled, group: ["World Completion"],
    style: () => iconStyle("assets/poi.png", 32, 1),
  },
  {
    id: "vista", sourceLayer: "vista", zIndex: 2, minZoomLevel: 6,
    friendlyName: "Vistas", icon: "/assets/vista.png", state: LayerState.Enabled, group: ["World Completion"],
    style: () => iconStyle("assets/vista.png", 32, 2),
  },
  {
    id: "unlocks", sourceLayer: "unlock", zIndex: 3, minZoomLevel: 4,
    friendlyName: "Instanced Content", icon: "/assets/commander_blue.png", state: LayerState.Enabled, group: ["Activities"],
    style: f => iconStyle(localIconSrc(f.get("icon") || "assets/poi.png"), 32, 3),
  },
  {
    id: "heart_labels", sourceLayer: "heart", zIndex: 4, minZoomLevel: 6,
    friendlyName: "Hearts", icon: "/assets/hearts.png", state: LayerState.Enabled, group: ["World Completion"],
    style: () => iconStyle("assets/hearts.png", 32, 4),
  },
  {
    id: "heropoint_labels", sourceLayer: "heropoint", zIndex: 5, minZoomLevel: 6,
    friendlyName: "Hero Points", icon: "/assets/heropoint.png", state: LayerState.Enabled, group: ["World Completion"],
    style: () => iconStyle("assets/heropoint.png", 32, 5),
  },
  {
    id: "masteries_labels", sourceLayer: "mastery", zIndex: 6, minZoomLevel: 6,
    friendlyName: "Masteries", icon: "/assets/core_mastery.png", state: LayerState.Enabled, group: ["World Completion"],
    style: f => iconStyle(masteryIcon(f.get("region")), 32, 6),
  },
  {
    id: "adventure_labels", sourceLayer: "adventure", zIndex: 7, minZoomLevel: 6,
    friendlyName: "Adventures", icon: "/assets/adventure_icon.png", state: LayerState.Enabled, group: ["Activities"],
    style: () => iconStyle("assets/adventure_icon.png", 32, 7),
  },
  {
    id: "city_markers", sourceLayer: "city", zIndex: 8, minZoomLevel: 7,
    friendlyName: "City Markers", icon: "/assets/portal_icon.png", state: LayerState.Enabled, group: ["World Map"],
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
      // Every feature is already loaded, so pinning a kind just means "ignore its
      // min-zoom gate" — the merged layer draws it at every zoom.
      return true;
    default:
      return sub.minZoomLevel === undefined || zoom > sub.minZoomLevel - 0.5;
  }
}

/**
 * Style function for the merged marker layer. The style reads each kind's panel
 * state, so the owning component must call layer.changed() when a sublayer's
 * state flips (a zoom change re-renders the layer on its own); see
 * syncMarkerVisibility in tyria-ol-map.component.ts.
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

/**
 * The non-icon Tyria overlays: panel-toggle stubs (empty sources, one per marker
 * sublayer plus region/map heading toggles — they exist only so the panel has a
 * toggle; actual rendering is in the merged marker layer and SVG LabelOverlays),
 * plus the sector heading-text and sector-outline layers backed by `source`.
 */
export function createTyriaOverlayDefinitions(source: VectorSource): LayerDefinition[] {
  return [
    ...TYRIA_MARKER_SUBLAYERS.map((sub): LayerDefinition => ({
      kind: "vector", id: sub.id, source: new VectorSource(),
      minZoomLevel: sub.minZoomLevel,
      friendlyName: sub.friendlyName, icon: sub.icon, state: sub.state, group: sub.group, zIndex: 2,
    })),
    {
      kind: "vector", id: "region_labels", source: new VectorSource(),
      minZoomLevel: 2, maxZoomLevel: 5, opacityLevels: {5: .2, 4: .6},
      friendlyName: "Region Headings", icon: "/assets/list_icon.png", state: LayerState.Enabled, group: ["World Map"], zIndex: 3,
    },
    {
      kind: "vector", id: "map_labels", source: new VectorSource(),
      minZoomLevel: 3, maxZoomLevel: 5, opacityLevels: {5: .7},
      friendlyName: "Map Headings", icon: "/assets/list_icon.png", state: LayerState.Enabled, group: ["World Map"], zIndex: 3,
    },
    {
      kind: "vector", id: "sector_headings", source, declutter: "labels",
      style: forSourceLayer("label_sector", f => labelStyle("sector", f.get("tooltip") ?? "")),
      minZoomLevel: 7, friendlyName: "Sector Headings", icon: "/assets/list_icon.png", state: LayerState.Enabled, group: ["World Map"], zIndex: 3,
    },
    {
      kind: "vector", id: "sector_polygons", source,
      style: forSourceLayer("sector_bounds", () => SECTOR_BOUNDS_STYLE),
      minZoomLevel: 7, friendlyName: "Sector Outlines", icon: "/assets/list_icon.png", state: LayerState.Disabled, group: ["World Map"], zIndex: 1,
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
 * starting within `showWithinMinutes` are shown.
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
