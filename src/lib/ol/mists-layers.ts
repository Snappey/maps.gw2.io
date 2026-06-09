import {Feature} from "ol";
import {FeatureLike} from "ol/Feature";
import Point from "ol/geom/Point";
import VectorSource from "ol/source/Vector";
import VectorTile from "ol/source/VectorTile";
import {Fill, Icon, Stroke, Style, Text} from "ol/style";
import {LayerState} from "../layer-state";
import {gw2ToOl} from "./gw2-projection";
import {LayerDefinition} from "./layer-registry";
import {iconStyle, labelStyle} from "./marker-styles";

export const TEAM_COLORS: {[team: string]: string} = {
  green: "#43D071",
  red: "#DC3939",
  blue: "#24A2E7",
  neutral: "#DDD",
};

export const teamColor = (owner: string | undefined): string =>
  TEAM_COLORS[owner?.toLowerCase() ?? ""] ?? TEAM_COLORS["neutral"];

const forSourceLayer = (sourceLayer: string, style: (feature: FeatureLike, resolution: number) => Style | Style[] | undefined) =>
  (feature: FeatureLike, resolution: number) => feature.get("layer") === sourceLayer ? style(feature, resolution) : undefined;

/**
 * Static mists overlays from PMTiles. Objectives/spawn texts are realtime
 * (see createObjectiveFeatures) — here only waypoints, headings, and the
 * sector outlines whose stroke colour is resolved per render via the
 * ownership lookup the component maintains from match polling.
 */
export function createMistsStaticDefinitions(
  source: VectorTile,
  sectorOwner: (sectorId: number) => string | undefined,
): LayerDefinition[] {
  return [
    {
      kind: "vector-tile", id: "mists_sector_objective", source, sourceLayer: "sector_bounds",
      style: forSourceLayer("sector_bounds", f => sectorStrokeStyle(teamColor(sectorOwner(f.get("id"))))),
      friendlyName: "Objective Sectors", icon: "/assets/sector_icon.png", state: LayerState.Enabled, zIndex: 1,
    },
    {
      kind: "vector-tile", id: "mists_map_headings", source, sourceLayer: "label_map", declutter: "labels",
      style: forSourceLayer("label_map", (f, res) => labelStyle("map", f.get("heading") ?? "", res)),
      friendlyName: "Map Headings", icon: "/assets/list_icon.png", state: LayerState.Enabled, zIndex: 3,
    },
    {
      kind: "vector-tile", id: "waypoints", source, sourceLayer: "waypoint",
      style: forSourceLayer("waypoint", () => iconStyle("assets/waypoint.png")),
      minZoomLevel: 5, friendlyName: "Waypoints", icon: "/assets/waypoint.png", state: LayerState.Enabled, zIndex: 2,
    },
  ];
}

const sectorStyleCache = new Map<string, Style>();
const sectorStrokeStyle = (color: string): Style => {
  let style = sectorStyleCache.get(color);
  if (!style) {
    style = new Style({stroke: new Stroke({color, width: 3})});
    sectorStyleCache.set(color, style);
  }
  return style;
};

export interface ObjectiveProperties {
  id: string;
  name: string;
  type: string;
  marker: string;
  chat_link: string;
  sector_id: number;
  owner?: string;
  friendlyOwner?: string;
  claimed_by?: string;
  yaks_delivered?: number;
  last_flipped?: Date | string;
}

/** Mirrors WvwService.calculateUpgradeLevel (kept here so styles stay pure). */
export const upgradeLevel = (yaksDelivered: number | undefined): number => {
  if (yaksDelivered === undefined) return 0;
  if (yaksDelivered >= 140) return 3;
  if (yaksDelivered >= 60) return 2;
  if (yaksDelivered >= 20) return 1;
  return 0;
};

export const friendlyUpgradeLevel = (level: number): string =>
  ["N/A", "Secured", "Reinforced", "Fortified"][level] ?? "N/A";

const RECENT_FLIP_WINDOW_MS = 300_000;

const badgeCache = new Map<string, Style>();
const badge = (src: string, size: number, displacement: [number, number]): Style => {
  const key = `${src}|${size}|${displacement.join(",")}`;
  let style = badgeCache.get(key);
  if (!style) {
    style = new Style({
      image: new Icon({src, width: size, height: size, displacement, crossOrigin: "anonymous"}),
    });
    badgeCache.set(key, style);
  }
  return style;
};

/**
 * Property-driven objective marker: team icon when claimed, upgrade pips,
 * guild-claim badge, recent-flip no-entry badge — the OL replacement for the
 * canvas-marker overlayIcons in the old createMistsMatchObjectives.
 */
export function objectiveStyle(feature: FeatureLike): Style | Style[] {
  const type: string = feature.get("type") ?? "";
  const owner: string | undefined = feature.get("owner");
  const claimedBy: string = feature.get("claimed_by") ?? "";
  const size = type === "Ruins" ? 24 : 32;

  const src = claimedBy === "" || !owner
    ? feature.get("marker") || "assets/keep_icon.png"
    : `assets/${type}_${owner}.png`.toLowerCase();

  const styles: Style[] = [iconStyle(src, size)];

  if (type !== "Ruins") {
    const pips = upgradeLevel(feature.get("yaks_delivered"));
    for (let i = 0; i < pips; i++) {
      styles.push(badge("assets/upgrade_pip.png", 10, [(i - (pips - 1) / 2) * 11, 23]));
    }
    if (claimedBy) {
      styles.push(badge("assets/guild_claimed.png", 13, [13, -13]));
    }
    const lastFlipped = feature.get("last_flipped");
    if (lastFlipped && Date.now() - new Date(lastFlipped).getTime() <= RECENT_FLIP_WINDOW_MS) {
      styles.push(badge("assets/no_entry.png", 13, [-13, -13]));
    }
  }

  return styles;
}

/** Team-coloured spawn name labels (replaces the spawn headings SVG overlay). */
export function spawnHeadingStyle(feature: FeatureLike, resolution: number): Style {
  const worldSizePx = 60; // 3.75rem in the old SVG overlay
  const screenPx = worldSizePx / resolution;
  return new Style({
    text: new Text({
      text: feature.get("friendlyOwner") ?? "",
      font: `italic ${Math.round(screenPx)}px 'PT Serif', serif`,
      fill: new Fill({color: teamColor(feature.get("owner"))}),
      stroke: new Stroke({color: "rgba(0, 0, 0, 0.9)", width: Math.max(1, screenPx / 12)}),
      overflow: true,
    }),
  });
}

/**
 * Upserts objective/spawn features in place (no layer rebuilds). `objectives`
 * may be the static neutral list (no match selected) or full match objectives.
 */
export function syncObjectiveFeatures(
  objectivesSource: VectorSource,
  spawnSource: VectorSource,
  objectives: Array<ObjectiveProperties & {coord?: [number, number], label_coord?: [number, number], map_id?: number}>,
  edgeOfTheMistsMapId: number,
) {
  const seenObjectives = new Set<string>();
  const seenSpawns = new Set<string>();

  for (const obj of objectives) {
    if (obj.map_id === edgeOfTheMistsMapId) {
      continue;
    }

    if (obj.coord) {
      seenObjectives.add(obj.id);
      let feature = objectivesSource.getFeatureById(obj.id) as Feature<Point> | null;
      if (!feature) {
        feature = new Feature({geometry: new Point(gw2ToOl(obj.coord))});
        feature.setId(obj.id);
        objectivesSource.addFeature(feature);
      }
      feature.setProperties({
        id: obj.id,
        name: obj.name ?? "",
        type: obj.type ?? "",
        marker: obj.marker ?? "",
        chat_link: obj.chat_link ?? "",
        sector_id: obj.sector_id ?? 0,
        owner: obj.owner,
        friendlyOwner: obj.friendlyOwner,
        claimed_by: obj.claimed_by ?? "",
        yaks_delivered: obj.yaks_delivered,
        last_flipped: obj.last_flipped,
      });
    }

    if (obj.label_coord && obj.type === "Spawn") {
      const spawnId = `spawn-${obj.id}`;
      seenSpawns.add(spawnId);
      let feature = spawnSource.getFeatureById(spawnId) as Feature<Point> | null;
      if (!feature) {
        feature = new Feature({geometry: new Point(gw2ToOl(obj.label_coord))});
        feature.setId(spawnId);
        spawnSource.addFeature(feature);
      }
      feature.setProperties({owner: obj.owner, friendlyOwner: obj.friendlyOwner});
    }
  }

  for (const feature of objectivesSource.getFeatures()) {
    if (!seenObjectives.has(feature.getId() as string)) {
      objectivesSource.removeFeature(feature);
    }
  }
  for (const feature of spawnSource.getFeatures()) {
    if (!seenSpawns.has(feature.getId() as string)) {
      spawnSource.removeFeature(feature);
    }
  }
}

/** Hover tooltip HTML for an objective, close to the old bindTooltip content. */
export function objectiveTooltipHtml(feature: FeatureLike): string {
  const name = feature.get("name") ?? "";
  const type = feature.get("type") ?? "";
  const owner: string | undefined = feature.get("owner");
  const friendlyOwner = feature.get("friendlyOwner");
  const tier = upgradeLevel(feature.get("yaks_delivered"));

  let html = `<p class="m-0 pl-1 text-base">${name}</p>`;
  html += `<p class="m-0 pl-1"><span class="mx-1">${type}</span>`;
  if (tier > 0) {
    html += `<span class="mx-1">- Tier ${tier} ${friendlyUpgradeLevel(tier)}</span>`;
  }
  html += "</p>";
  if (owner && friendlyOwner) {
    html += "<hr><p class='m-0'>Controlled By:</p>";
    html += `<p class="m-0 pl-1 mists ${owner.toLowerCase()}">${friendlyOwner}</p>`;
  }
  if (feature.get("claimed_by")) {
    html += "<p class='m-0'>Claimed by a guild</p>";
  }
  return html;
}
