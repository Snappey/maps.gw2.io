import {Feature} from "ol";
import {FeatureLike} from "ol/Feature";
import Point from "ol/geom/Point";
import VectorSource from "ol/source/Vector";
import {Fill, Icon, Stroke, Style, Text} from "ol/style";
import {LayerState} from "../layer-state";
import {gw2ToOl} from "./gw2-projection";
import {LayerDefinition} from "./layer-registry";
import {iconStyle} from "./marker-styles";
import {forSourceLayer} from "./feature-meta";

export const TEAM_COLORS: {[team: string]: string} = {
  green: "#43D071",
  red: "#DC3939",
  blue: "#24A2E7",
  neutral: "#DDD",
};

export const teamColor = (owner: string | undefined): string =>
  TEAM_COLORS[owner?.toLowerCase() ?? ""] ?? TEAM_COLORS["neutral"];

/** Canonical team order for the WvW charts/HUD (red, blue, green). */
export const TEAM_ORDER = ["red", "blue", "green"] as const;

/**
 * Static Mists overlays sharing the non-tiled marker source: waypoint icons, the
 * map-heading panel stub, and the sector outlines whose stroke colour resolves
 * per render via the ownership lookup the component maintains from match polling
 * (objectives/spawn texts are realtime — see syncObjectiveFeatures).
 */
export function createMistsStaticDefinitions(
  source: VectorSource,
  sectorOwner: (sectorId: number) => string | undefined,
): LayerDefinition[] {
  return [
    {
      kind: "vector", id: "mists_sector_objective", source,
      style: forSourceLayer("sector_bounds", (f, resolution) =>
        sectorStrokeStyle(teamColor(sectorOwner(f.get("id"))), resolution)),
      friendlyName: "Objective Sectors", icon: "/assets/sector_icon.png", state: LayerState.Enabled, group: ["Objectives"], zIndex: 1,
    },
    // Visibility stub for the layer panel: the heading text is drawn by the
    // LabelOverlays SVG, which follows this layer's visibility.
    {
      kind: "vector", id: "mists_map_headings", source: new VectorSource(),
      friendlyName: "Map Headings", icon: "/assets/list_icon.png", state: LayerState.Enabled, group: ["World Map"], zIndex: 3,
    },
    {
      kind: "vector", id: "waypoints", source,
      style: forSourceLayer("waypoint", () => iconStyle("assets/waypoint.png")),
      minZoomLevel: 6, friendlyName: "Waypoints", icon: "/assets/waypoint.png", state: LayerState.Enabled, group: ["World Map"], zIndex: 2,
    },
  ];
}

// Sector bounds as a solid team-coloured line, no fill. The stroke width tapers
// with zoom: the polygons are shrunk 3%, so zoomed out only a few screen px
// separate neighbouring borders and a fixed 5px stroke would blend them. Widths
// bucket to 0.5px to keep the style cache small.
const sectorStyleCache = new Map<string, Style>();
const sectorStrokeStyle = (color: string, resolution: number): Style => {
  const width = Math.round(Math.max(1.5, Math.min(5, 16 / resolution)) * 2) / 2;
  const key = `${color}|${width}`;
  let style = sectorStyleCache.get(key);
  if (!style) {
    style = new Style({stroke: new Stroke({color, width})});
    sectorStyleCache.set(key, style);
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
  /** Upgrade tier (0–3), resolved against the objective's tier schedule upstream. */
  upgrade_tier?: number;
  last_flipped?: Date | string;
}

/** Righteous Indignation: objective guards are invulnerable for 5 min after a flip. */
export const RECENT_FLIP_WINDOW_MS = 300_000;

/** Objective types whose guards get Righteous Indignation after a flip. */
export const RI_TYPES = new Set(["Camp", "Tower", "Keep", "Castle", "Mercenary"]);

/** Remaining Righteous Indignation time, 0 when expired or not applicable. */
export const riRemainingMs = (feature: FeatureLike, now: number): number => {
  if (!RI_TYPES.has(feature.get("type"))) {
    return 0;
  }
  const lastFlipped = feature.get("last_flipped");
  if (!lastFlipped) {
    return 0;
  }
  const remaining = RECENT_FLIP_WINDOW_MS - (now - new Date(lastFlipped).getTime());
  return remaining > 0 ? remaining : 0;
};

// One cached style per mm:ss string — naturally bounded by the 5-minute window.
const riTextCache = new Map<string, Style>();
const riCountdownStyle = (mmss: string): Style => {
  let style = riTextCache.get(mmss);
  if (!style) {
    style = new Style({
      text: new Text({
        text: mmss,
        offsetY: 30,
        font: "bold 11px sans-serif",
        fill: new Fill({color: "#FFF"}),
        stroke: new Stroke({color: "rgba(0, 0, 0, 0.9)", width: 3}),
      }),
    });
    riTextCache.set(mmss, style);
  }
  return style;
};

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

/** Objective types with hand-made team-coloured icons in src/assets. */
const TEAM_ICON_TYPES = new Set(["camp", "castle", "keep", "tower", "ruins"]);
const TEAMS = new Set<string>(TEAM_ORDER);

/**
 * Icon for an objective: the hand-made team-coloured PNG when owned, else the
 * local copy of the neutral render-API marker (cached into assets/wvw/ by
 * `npm run cache-wvw-icons` — never hotlink render.guildwars2.com).
 */
export const wvwMarkerSrc = (markerUrl: string, owner?: string, type?: string): string => {
  const team = owner?.toLowerCase() ?? "";
  if (TEAMS.has(team) && TEAM_ICON_TYPES.has(type?.toLowerCase() ?? "")) {
    return `assets/${type!.toLowerCase()}_${team}.png`;
  }
  const fileId = markerUrl.split("/").pop()?.replace(/\.png$/i, "") ?? "";
  return `assets/wvw/${fileId}.png`;
};

/**
 * Property-driven objective marker mirroring the in-game map: team-tinted
 * render-API icon, tier pips arced above, gold guild-claim shield, waypoint
 * diamond on fortified keeps, and an RI countdown after a flip.
 */
export function objectiveStyle(feature: FeatureLike): Style | Style[] {
  const type: string = feature.get("type") ?? "";
  const owner: string | undefined = feature.get("owner");
  const claimedBy: string = feature.get("claimed_by") ?? "";
  const size = type === "Ruins" ? 24 : 32;

  const marker: string = feature.get("marker") ?? "";
  const src = marker ? wvwMarkerSrc(marker, owner, type) : "assets/keep_icon.png";

  const styles: Style[] = [iconStyle(src, size)];

  if (type !== "Ruins") {
    // Upgrade tier as pips sitting flush on the icon's top rim like in-game:
    // each pip centre lies on the rim circle, so the outer pips of a
    // Fortified row drop with the curve. The team icons' visible disc is
    // 25px inside the 32px asset, hence the 0.78 factor; +4 = pip
    // half-height (5) minus 1px overlap so they touch the edge.
    const tier = (feature.get("upgrade_tier") as number | undefined) ?? 0;
    const rimRadius = (size / 2) * 0.78 + 4;
    for (let i = 0; i < tier; i++) {
      const dx = (i - (tier - 1) / 2) * 11;
      const dy = Math.round(Math.sqrt(rimRadius * rimRadius - dx * dx));
      styles.push(badge("assets/upgrade_pip.png", 10, [dx, dy]));
    }
    if (claimedBy) {
      styles.push(badge("assets/guild_claimed.png", 13, [13, -13]));
    }
    // The in-game map marks keeps whose waypoint exists (built at Fortified).
    if (tier === 3 && (type === "Keep" || type === "Castle")) {
      styles.push(badge("assets/waypoint.png", 14, [-(size / 2 + 6), 0]));
    }
    const riMs = riRemainingMs(feature, Date.now());
    if (riMs > 0) {
      styles.push(badge("assets/no_entry.png", 13, [-13, -13]));
      const totalSeconds = Math.ceil(riMs / 1000);
      styles.push(riCountdownStyle(`${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`));
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
        upgrade_tier: obj.upgrade_tier ?? 0,
        last_flipped: obj.last_flipped,
        // Full source object for the objective-details dialog (match mode only).
        objective_data: obj,
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
