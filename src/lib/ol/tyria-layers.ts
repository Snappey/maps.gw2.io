import {FeatureLike} from "ol/Feature";
import VectorTile from "ol/source/VectorTile";
import {Fill, Stroke, Style} from "ol/style";
import {StyleLike} from "ol/style/Style";
import {LayerState} from "../layer-state";
import {LayerDefinition} from "./layer-registry";
import {iconStyle, labelStyle, masteryFriendlyName, masteryIcon} from "./marker-styles";

const forSourceLayer = (sourceLayer: string, style: (feature: FeatureLike, resolution: number) => Style | Style[] | undefined): StyleLike =>
  (feature, resolution) => feature.get("layer") === sourceLayer ? style(feature, resolution) : undefined;

/**
 * The Tyria overlays, all sharing one PMTiles source (tiles are fetched and
 * decoded once; each layer styles only its own source-layer). Ids, zoom
 * thresholds and opacity tables match the Leaflet registrations in
 * tyria-map.component.ts so the layer panel behaves identically.
 */
export function createTyriaOverlayDefinitions(source: VectorTile): LayerDefinition[] {
  return [
    {
      kind: "vector-tile", id: "waypoints", source, sourceLayer: "waypoint",
      style: forSourceLayer("waypoint", () => iconStyle("assets/waypoint.png")),
      minZoomLevel: 5, friendlyName: "Waypoints", icon: "/assets/waypoint.png", state: LayerState.Enabled, zIndex: 2,
    },
    {
      kind: "vector-tile", id: "landmarks", source, sourceLayer: "poi",
      style: forSourceLayer("poi", () => iconStyle("assets/poi.png")),
      minZoomLevel: 6, friendlyName: "Points of Interest", icon: "/assets/poi.png", state: LayerState.Enabled, zIndex: 2,
    },
    {
      kind: "vector-tile", id: "vista", source, sourceLayer: "vista",
      style: forSourceLayer("vista", () => iconStyle("assets/vista.png")),
      minZoomLevel: 6, friendlyName: "Vistas", icon: "/assets/vista.png", state: LayerState.Enabled, zIndex: 2,
    },
    {
      kind: "vector-tile", id: "unlocks", source, sourceLayer: "unlock",
      style: forSourceLayer("unlock", f => iconStyle(f.get("icon") || "assets/poi.png")),
      minZoomLevel: 4, friendlyName: "Instanced Content", icon: "/assets/commander_blue.png", state: LayerState.Enabled, zIndex: 2,
    },
    {
      kind: "vector-tile", id: "heart_labels", source, sourceLayer: "heart",
      style: forSourceLayer("heart", () => iconStyle("assets/hearts.png")),
      minZoomLevel: 6, friendlyName: "Hearts", icon: "/assets/hearts.png", state: LayerState.Enabled, zIndex: 2,
    },
    {
      kind: "vector-tile", id: "heropoint_labels", source, sourceLayer: "heropoint",
      style: forSourceLayer("heropoint", () => iconStyle("assets/heropoint.png")),
      minZoomLevel: 6, friendlyName: "Hero Points", icon: "/assets/heropoint.png", state: LayerState.Enabled, zIndex: 2,
    },
    {
      kind: "vector-tile", id: "masteries_labels", source, sourceLayer: "mastery",
      style: forSourceLayer("mastery", f => iconStyle(masteryIcon(f.get("region")))),
      minZoomLevel: 6, friendlyName: "Masteries", icon: "/assets/core_mastery.png", state: LayerState.Enabled, zIndex: 2,
    },
    {
      kind: "vector-tile", id: "adventure_labels", source, sourceLayer: "adventure",
      style: forSourceLayer("adventure", () => iconStyle("assets/adventure_icon.png")),
      minZoomLevel: 6, friendlyName: "Adventures", icon: "/assets/adventure_icon.png", state: LayerState.Enabled, zIndex: 2,
    },
    {
      kind: "vector-tile", id: "city_markers", source, sourceLayer: "city",
      style: forSourceLayer("city", f => f.get("icon") ? iconStyle(f.get("icon"), 24) : undefined),
      minZoomLevel: 7, friendlyName: "City Markers", icon: "/assets/portal_icon.png", state: LayerState.Enabled, zIndex: 2,
    },
    {
      kind: "vector-tile", id: "region_labels", source, sourceLayer: "label_region", declutter: "labels",
      style: forSourceLayer("label_region", (f, res) => labelStyle("region", f.get("heading") ?? "", res)),
      minZoomLevel: 2, maxZoomLevel: 5, opacityLevels: {5: .2, 4: .6},
      friendlyName: "Region Headings", icon: "/assets/list_icon.png", state: LayerState.Enabled, zIndex: 3,
    },
    {
      kind: "vector-tile", id: "map_labels", source, sourceLayer: "label_map", declutter: "labels",
      style: forSourceLayer("label_map", (f, res) => {
        const styles = [labelStyle("map", f.get("heading") ?? "", res)];
        if (f.get("subheading")) {
          styles.push(labelStyle("map_sub", f.get("subheading"), res));
        }
        return styles;
      }),
      minZoomLevel: 3, maxZoomLevel: 5, opacityLevels: {5: .7},
      friendlyName: "Map Headings", icon: "/assets/list_icon.png", state: LayerState.Enabled, zIndex: 3,
    },
    {
      kind: "vector-tile", id: "sector_headings", source, sourceLayer: "label_sector", declutter: "labels",
      style: forSourceLayer("label_sector", (f, res) => labelStyle("sector", f.get("tooltip") ?? "", res)),
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

/** Hover tooltip text per source-layer, mirroring the old Leaflet bindTooltip calls. */
export function tooltipFor(feature: FeatureLike): string | undefined {
  switch (feature.get("layer")) {
    case "waypoint":
    case "poi":
    case "unlock":
    case "heart":
    case "label_sector":
      return feature.get("tooltip") || feature.get("chat_link") || undefined;
    case "vista":
      return "Vista";
    case "heropoint":
      return "Skillpoint";
    case "mastery":
      return `${masteryFriendlyName(feature.get("region"))} Mastery`;
    case "adventure":
      return feature.get("name") || undefined;
    case "city":
      return feature.get("name") || undefined;
    default:
      return undefined;
  }
}

/** Double-click target per source-layer (wiki search or adventure url). */
export function wikiUrlFor(feature: FeatureLike): string | undefined {
  const search = (term: string) => `https://wiki.guildwars2.com/wiki/?search=${term}&ns0=1`;
  switch (feature.get("layer")) {
    case "waypoint":
    case "poi":
    case "unlock":
      return feature.get("tooltip") ? search(feature.get("tooltip")) : search(encodeURIComponent(feature.get("chat_link") ?? ""));
    case "heart": {
      const tooltip: string = feature.get("tooltip") ?? "";
      // Heart tooltips end with a period; the old map trimmed it for the search.
      return tooltip ? search(tooltip.substring(0, tooltip.length - 1)) : undefined;
    }
    case "adventure":
      return feature.get("url") || undefined;
    case "city":
      return feature.get("name") ? search(feature.get("name")) : undefined;
    default:
      return undefined;
  }
}

/** Click-to-copy chat link, where the source data has one. */
export function chatLinkFor(feature: FeatureLike): string | undefined {
  switch (feature.get("layer")) {
    case "waypoint":
    case "poi":
    case "unlock":
    case "heart":
    case "vista":
    case "label_sector":
      return feature.get("chat_link") || undefined;
    default:
      return undefined;
  }
}
