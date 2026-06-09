import {Fill, Icon, Stroke, Style, Text} from "ol/style";

// Style identity matters for OL render performance: cache by key so the same
// Style instance is returned for every feature using a given icon/text config.
const styleCache = new Map<string, Style>();

export const iconStyle = (src: string, sizePx: number = 32): Style => {
  const key = `icon|${src}|${sizePx}`;
  let style = styleCache.get(key);
  if (!style) {
    style = new Style({
      image: new Icon({
        src,
        width: sizePx,
        height: sizePx,
        crossOrigin: "anonymous",
      }),
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
  /** Font size in world (continent) pixels — like the old SVG overlays, the
   * label visually scales with the map instead of staying screen-constant. */
  worldSizePx: number;
  color: string;
  offsetYWorldPx?: number;
}

export const LABEL_STYLES: {[kind: string]: LabelStyleConfig} = {
  region: {worldSizePx: 320, color: "#FFCC66"},
  map: {worldSizePx: 128, color: "#FFCC66"},
  map_sub: {worldSizePx: 121, color: "#DDD", offsetYWorldPx: 120},
  sector: {worldSizePx: 14.4, color: "#DDD"},
};

export const labelStyle = (kind: string, text: string, resolution: number): Style => {
  const config = LABEL_STYLES[kind];
  const screenPx = config.worldSizePx / resolution;
  // Text instances are cheap but Style identity still helps; cache by rendered size bucket.
  const key = `label|${kind}|${text}|${Math.round(screenPx)}`;
  let style = styleCache.get(key);
  if (!style) {
    style = new Style({
      text: new Text({
        text,
        font: `italic ${Math.round(screenPx)}px 'PT Serif', serif`,
        fill: new Fill({color: config.color}),
        stroke: new Stroke({color: "rgba(0, 0, 0, 0.9)", width: Math.max(1, screenPx / 12)}),
        offsetY: config.offsetYWorldPx ? config.offsetYWorldPx / resolution : 0,
        overflow: true,
      }),
    });
    styleCache.set(key, style);
  }
  return style;
};
