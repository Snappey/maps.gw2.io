// Single source of truth for the seeding pipeline: tunables, repo-root path
// helpers (so scripts run from any CWD), and the validation floors that guard
// each committed file.

import path from "node:path";
import {fileURLToPath} from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const dataFile = (name) => path.join(ROOT, "src", "assets", "data", name);
export const assetPath = (...p) => path.join(ROOT, "src", "assets", ...p);
export const staticFile = (name) => path.join(ROOT, "scripts", "static", name);
export const outFile = (name) => path.join(ROOT, "scripts", "out", name);

export const USER_AGENT = "map-gw2-io seeding pipeline (+https://maps.gw2.io)";

export const GW2_API = "https://api.guildwars2.com/v2";
export const WIKI_API = "https://wiki.guildwars2.com/api.php";

// The wiki's event-timer widget data: a single pure-JSON page (action=raw),
// the authoritative source for every meta event's phases + schedule.
export const WIKI_EVENT_TIMER_URL =
  "https://wiki.guildwars2.com/index.php?title=Widget:Event_timer/data.json&action=raw";

// --- generate_pois ----------------------------------------------------------
// Floors merged per continent, and POI name overrides applied to landmarks.
export const POI_FLOORS = {
  1: [1, 49, 80],
  2: [1],
};

// NOTE: id 3454 deliberately maps to undefined. The original script had a
// `name`/`.Name` key typo that blanked this POI's tooltip; we preserve that
// exact output so this refactor introduces no data changes.
export const POI_OVERRIDES = {
  2344: "Raid Lobby",
  2970: "Mythwright Gambit",
  2080: "Forsaken Thicket",
  2452: "Bastion of the Penitent",
  2850: "Hall of Chains",
  3451: "Scrying Stone: Cantha Strike Missions",
  3454: undefined,
};

// --- generate_regions -------------------------------------------------------
export const REGION_BLACKLIST = new Set([
  "Dragon Bash Arena",
  "Noble's Folly",
  "Lion's Arch Aerodrome",
  "Strike Mission: Shiverpeaks Pass (Public)",
  "Crystal Desert",
  "Labyrinthine Cliffs",
]);

// Which maps to keep per continent. Operates on the parsed /maps/{id} body.
export const CONTINENT_MAP_FILTER = {
  1: (map) => map.type === "Public",
  2: () => true,
};

// --- generate_extras --------------------------------------------------------
// City pages whose {{interactive map}} markers are scraped from the wiki.
export const CITY_PAGES = [
  "Lion's Arch",
  "Arborstone",
  "Lion's_Arch_Aerodrome",
  "Black Citadel",
  "Hoelbrak",
  "Rata Sum",
  "Divinity's Reach",
  "The Grove",
  "Eye of the North",
  "Labyrinthine Cliffs",
  "The Wizard's Tower",
  "Thousand Seas Pavilion",
];

// --- generate_wvw_icons -----------------------------------------------------
// Icons that aren't objective markers but follow the same caching pipeline.
export const WVW_EXTRA_ICONS = [
  {
    // Emergency Waypoint guild tactic (id 178), shown in the tooltip when slotted.
    url: "https://render.guildwars2.com/file/1EFC4507C290C94833505903AC30383240E2B70D/1202668.png",
    name: "emergency_waypoint",
  },
  {
    // Borderlands Bloodlust buff icon for the war-score HUD.
    url: "https://wiki.guildwars2.com/images/f/f7/Major_Borderlands_Bloodlust.png",
    name: "bloodlust",
  },
];

// --- generate_event_timers --------------------------------------------------
// The wiki groups events by a human "category"; the app groups by an xpac code.
// Living World seasons fold into the adjacent expansion as the old hand-curated
// file did (LWS4 -> "pof", Icebrood Saga -> "ibs"). null means "known category,
// intentionally not surfaced" (festivals); a category absent here warns and is
// skipped.
export const CATEGORY_TO_XPAC = {
  "Core Tyria": "core",
  "Living World Season 2": "core",
  "Heart of Thorns": "hot",
  "Living World Season 3": "hot",
  "Path of Fire": "pof",
  "Living World Season 4": "pof",
  "The Icebrood Saga": "ibs",
  "End of Dragons": "eod",
  "Secrets of the Obscure": "soto",
  "Janthir Wilds": "jw",
  "Visions of Eternity": "voe",
  "Public Instances": "public",
  "Special Events": null, // festivals — seasonal, excluded like the wiki page's template param
};

// Event keys to drop: schedules with no single "go here now" map location
// (day/night cycles, PvP tournaments, world-wide invasions, fractal incursions).
// Remove a key here to surface that event.
export const EVENT_EXCLUDE = new Set([
  "t", // sentinel row in the wiki data (empty category/name)
  "core-dn", "eod-dn", "voe-dn", // day & night cycles
  "core-ateu", "core-atna", // PvP tournaments
  "core-in", // Invasions
  "core-fi", // Fractal Incursions
]);

// Escape hatch for events whose `name` is not exactly a GW2 map name but which
// do live on one map. Maps event key -> map name (resolved to that map's centre
// when no per-phase chat-link coordinate is found). Empty until a run needs it.
export const EVENT_MAP_OVERRIDES = {};

// --- generate_taco_trails ---------------------------------------------------
// Raw-file base for the bundled TacO marker pack (Lady Elyssa's Markers). No
// trailing slash; callers URL-encode each path segment (filenames have spaces).
// The repo has no license file (all rights reserved) — we bundle the selected
// data with visible attribution to Lady Elyssa's Markers + a link to the repo.
export const TACO_REPO_RAW =
  "https://raw.githubusercontent.com/LadyElyssa/LadyElyssaTacoTrails/HEAD";

// Whitelist of source files to convert, ONE UserLayer per content file (not the
// nested TacO category tree). Each content file (e.g. "Bounty.xml") carries the
// <POI>/<Trail> placements; the paired menu file carries the <MarkerCategory>
// tree with the display names / icons / colours those placements reference by
// `type`, so both are fetched.
//   menuFile      — defaults to 10_Menu_<name, spaces→underscores>.xml, but the
//                  pack doesn't always follow that: "Rift Hunting.xml" uses
//                  10_Menu_Rifts.xml, and every "Gathering - *.xml" shares the
//                  single 10_Menu_Gathering.xml — so those override it.
//   subgroup      — optional second-level panel group under "Lady Elyssa's
//                  Guides" (e.g. nest the many Gathering layers under "Gathering").
//   continentId   — the layer's continent (1 = Tyria); features resolving to a
//                  different continent are skipped.
//   includeTrails — default false: <Trail> elements and their .trl binaries are
//                  skipped entirely (POIs only). Flip true to also import trails.
//   colorFallback — layer colour when no trail colour resolves (also the POI
//                  dot colour for markers without an icon).
export const TACO_TRAILS = [
  {contentFile: "Bounty.xml", layerName: "Bounty", continentId: 1, includeTrails: false, colorFallback: "#FFCC66"},
  {contentFile: "Ranger Pets.xml", layerName: "Ranger Pets", continentId: 1, includeTrails: false, colorFallback: "#66CCFF"},
  {contentFile: "Fishing.xml", layerName: "Fishing", continentId: 1, includeTrails: false, colorFallback: "#66FF99"},
  {contentFile: "Vendors.xml", layerName: "Vendors", continentId: 1, includeTrails: false, colorFallback: "#FFD27F"},
  {contentFile: "Rift Hunting.xml", menuFile: "10_Menu_Rifts.xml", layerName: "Rift Hunting", continentId: 1, includeTrails: false, colorFallback: "#C792EA"},
  // Gathering — all share 10_Menu_Gathering.xml; nested under a "Gathering" subgroup.
  {contentFile: "Gathering - Ore.xml", menuFile: "10_Menu_Gathering.xml", subgroup: "Gathering", layerName: "Ore", continentId: 1, includeTrails: false, colorFallback: "#B0BEC5"},
  {contentFile: "Gathering - Wood.xml", menuFile: "10_Menu_Gathering.xml", subgroup: "Gathering", layerName: "Wood", continentId: 1, includeTrails: false, colorFallback: "#A1887F"},
  {contentFile: "Gathering - Plants.xml", menuFile: "10_Menu_Gathering.xml", subgroup: "Gathering", layerName: "Plants", continentId: 1, includeTrails: false, colorFallback: "#81C784"},
  {contentFile: "Gathering - General.xml", menuFile: "10_Menu_Gathering.xml", subgroup: "Gathering", layerName: "General", continentId: 1, includeTrails: false, colorFallback: "#90CAF9"},
  {contentFile: "Gathering - Ascended.xml", menuFile: "10_Menu_Gathering.xml", subgroup: "Gathering", layerName: "Ascended", continentId: 1, includeTrails: false, colorFallback: "#FF8A65"},
  {contentFile: "Gathering - Expac.xml", menuFile: "10_Menu_Gathering.xml", subgroup: "Gathering", layerName: "Expansions", continentId: 1, includeTrails: false, colorFallback: "#CE93D8"},
  {contentFile: "Gathering - LWS3.xml", menuFile: "10_Menu_Gathering.xml", subgroup: "Gathering", layerName: "Living World S3", continentId: 1, includeTrails: false, colorFallback: "#80CBC4"},
  {contentFile: "Gathering - LWS4.xml", menuFile: "10_Menu_Gathering.xml", subgroup: "Gathering", layerName: "Living World S4", continentId: 1, includeTrails: false, colorFallback: "#80CBC4"},
  {contentFile: "Gathering - LWS5.xml", menuFile: "10_Menu_Gathering.xml", subgroup: "Gathering", layerName: "Living World S5", continentId: 1, includeTrails: false, colorFallback: "#80CBC4"},
];

// Some marker categories are excluded from the bundled guides — we ship the
// resource/vendor/etc. markers, not the route-navigation chrome: "summon your
// mount here" hints (Mounts/) and the numbered step markers that sequence a
// gathering route (Numbers/ — bare "1","2","3"… overlays). A marker is dropped
// when its icon resolves under one of these rel-path prefixes OR its category
// `type` contains one of these exact dotted segments. (generate_taco_trails.mjs)
export const TACO_EXCLUDE_ICON_PREFIXES = ["Mounts/", "Numbers/"];
export const TACO_EXCLUDE_CATEGORY_SEGMENTS = ["mounts"];

// --- validation floors ------------------------------------------------------
// ratio: fail if a fresh run drops below ratio*previous committed count.
// minAbsolute: hard floor used on first run / when no previous file exists.
// Wiki-scraped data (extras) is the most fragile, so it gets the tightest gate.
export const VALIDATION = {
  poi_1_1: {ratio: 0.9, minAbsolute: 5000, label: "poi_labels_1_1"},
  poi_2_1: {ratio: 0.9, minAbsolute: 200, label: "poi_labels_2_1"},
  region_1_1: {ratio: 0.9, minAbsolute: 80, label: "region_labels_1_1"},
  region_2_1: {ratio: 0.9, minAbsolute: 12, label: "region_labels_2_1"},
  city_markers: {ratio: 0.85, minAbsolute: 150, label: "city_markers"},
  adventures: {ratio: 0.85, minAbsolute: 80, label: "adventure_labels"},
  // event_timers.json is an object; the floor is on its total displayable phase
  // count (see assertEventTimers).
  event_timers: {ratio: 0.85, minAbsolute: 30, label: "event_timers"},
  // taco_trails.json is an array of UserLayer (one per whitelisted file).
  // ratio/minAbsolute gate the layer COUNT (3); minFeatures is a separate
  // explicit guard against POI/trail collapse (checked in generate_taco_trails).
  taco_trails: {ratio: 0.9, minAbsolute: 3, minFeatures: 100, label: "taco_trails"},
};
