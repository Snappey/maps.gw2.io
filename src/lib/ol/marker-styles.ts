import {Fill, Icon, Stroke, Style, Text} from "ol/style";

// Style identity matters for OL render performance: cache by key so the same
// Style instance is returned for every feature using a given icon/text config.
const styleCache = new Map<string, Style>();

const WIKI_IMAGE_PREFIX = "https://wiki.guildwars2.com/images/";

/**
 * The GW2 wiki serves /images/ without CORS headers, so the renderer — which
 * must load icons with crossOrigin for canvas hit detection — can never fetch
 * them. Feature data still carries wiki URLs; map them to the local copies
 * cached by scripts/download_city_icons.mjs (same name sanitisation).
 */
export const localIconSrc = (src: string): string =>
  src.startsWith(WIKI_IMAGE_PREFIX)
    ? "assets/city_icons/" + decodeURIComponent(src.split("/").pop()!).replace(/[^A-Za-z0-9._-]/g, "_")
    : src;

/** zIndex orders features within a single layer (e.g. the merged marker layer). */
export const iconStyle = (src: string, sizePx: number = 32, zIndex?: number): Style => {
  const key = `icon|${src}|${sizePx}|${zIndex ?? ""}`;
  let style = styleCache.get(key);
  if (!style) {
    style = new Style({
      image: new Icon({
        src,
        width: sizePx,
        height: sizePx,
        crossOrigin: "anonymous",
      }),
      zIndex,
    });
    styleCache.set(key, style);
  }
  return style;
};

export type MasteryRegion = "Tyria" | "Maguuma" | "Desert" | "Tundra" | "Jade" | "Sky" | "Wild" | "Magic" | string;

export const masteryIcon = (region: MasteryRegion): string => {
  switch (region) {
    case "Tyria": return "assets/core_mastery.png";
    case "Maguuma": return "assets/hot_mastery.png";
    case "Desert": return "assets/pof_mastery.png";
    case "Tundra": return "assets/ibs_mastery.png";
    case "Jade": return "assets/eod_mastery.png";
    case "Sky": return "assets/soto_mastery.png";
    case "Wild": return "assets/janthir_mastery.png";
    case "Magic": return "assets/voe_mastery.png";
    default: return "assets/core_mastery.png";
  }
};

export const masteryFriendlyName = (region: MasteryRegion): string => {
  switch (region) {
    case "Tyria": return "Core";
    case "Maguuma": return "HoT";
    case "Desert": return "PoF";
    case "Tundra": return "IBS";
    case "Jade": return "EoD";
    case "Sky": return "SOTO";
    case "Wild": return "JW";
    case "Magic": return "VoE";
    default: return "Unknown";
  }
};

export interface LabelStyleConfig {
  /** Font size in CSS pixels — constant regardless of zoom level. */
  screenPx: number;
  color: string;
  offsetYPx?: number;
}

// Fixed CSS pixel sizes calibrated to the old SVG overlays at zoom 4
// (region 320 / map 128 / sub 121.6 world px, all divided by 2^(7-4)).
export const LABEL_STYLES: {[kind: string]: LabelStyleConfig} = {
  region: {screenPx: 40, color: "#FFCC66"},
  map: {screenPx: 16, color: "#FFCC66"},
  map_sub: {screenPx: 15, color: "#DDD", offsetYPx: 15},
  sector: {screenPx: 14, color: "#DDD"},
};

export const labelStyle = (kind: string, text: string): Style => {
  const config = LABEL_STYLES[kind];
  const key = `label|${kind}|${text}`;
  let style = styleCache.get(key);
  if (!style) {
    style = new Style({
      text: new Text({
        text,
        font: `italic ${config.screenPx}px 'PT Serif', serif`,
        fill: new Fill({color: config.color}),
        stroke: new Stroke({color: "rgba(0, 0, 0, 0.9)", width: Math.max(1, config.screenPx / 12)}),
        offsetY: config.offsetYPx ?? 0,
        overflow: true,
      }),
    });
    styleCache.set(key, style);
  }
  return style;
};
