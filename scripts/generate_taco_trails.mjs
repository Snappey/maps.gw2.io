// Converts selected GW2 TacO marker files from the "Lady Elyssa's Markers" pack
// (github.com/LadyElyssa/LadyElyssaTacoTrails) into committed overlay layers the
// maps render — one toggleable UserLayer per whitelisted content file (see
// TACO_TRAILS in config.mjs). For each file we fetch the content XML (the
// <POI>/<Trail> placements) and its paired 10_Menu_*.xml (the <MarkerCategory>
// tree those placements reference for labels/icons/colours), convert each
// placement's world coordinates to continent pixels, and download the referenced
// icons into src/assets/taco_icons. POIs only unless an entry sets
// includeTrails. Output is atomic + shrink-gated + key-sorted, so a no-op re-run
// is an empty diff.
//   npm run cache-taco-trails
//
// The pure parse/convert logic below is a Node port of the app's browser-side
// TypeScript (parseTacoXml uses the DOM; buildTacoLayers is Angular-coupled and
// uses non-deterministic ids). Keep these in sync with the source of truth:
//   src/lib/taco/taco-parse.ts    — parseTacoXml, parseTrl, attr/num/walkCategories
//   src/lib/taco/taco-convert.ts  — worldToContinent / placePoi / placeTrail
//   src/lib/taco/taco-import.ts   — markerTooltip / iconForType / normalizeColor / splitSegments

import {existsSync, statSync} from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {DOMParser} from "@xmldom/xmldom";
import {fetchJson, fetchBuffer} from "./lib/http.mjs";
import {writeJsonAtomic, readJsonIfExists, writeFileAtomic} from "./lib/io.mjs";
import {assertNotShrunk} from "./lib/validate.mjs";
import {log} from "./lib/log.mjs";
import {GW2_API, dataFile, assetPath, TACO_REPO_RAW, TACO_TRAILS, TACO_EXCLUDE_ICON_PREFIXES, TACO_EXCLUDE_CATEGORY_SEGMENTS, VALIDATION} from "./config.mjs";

const OUT_FILE = dataFile("taco_trails.json");
const ICON_DIR = assetPath("taco_icons");
const ICON_URL_BASE = "/assets/taco_icons"; // public URL prefix baked into feature.icon
const PACK_GROUP = "Lady Elyssa's Markers"; // panel group header == visible attribution

// GW2 game units are inches; MumbleLink/TacO positions are metres. (taco-convert.ts)
const INCHES_PER_METRE = 39.3701;
// A (0,0,0) world vertex marks a break between trail segments. (taco-import.ts)
const BREAK_EPSILON = 1e-3;

// --- XML parsing (port of taco-parse.ts) ------------------------------------
// xmldom's DOM is a Level-1-ish implementation, so we read attributes/children
// by index and use getElementsByTagName("*") + a case-insensitive filter (TacO
// packs are inconsistent about tag/attribute casing) rather than relying on
// HTMLCollection conveniences.

/** Case-insensitive attribute read. */
function attr(el, name) {
  const lower = name.toLowerCase();
  const list = el.attributes;
  if (!list) {
    return undefined;
  }
  for (let i = 0; i < list.length; i++) {
    const a = list.item ? list.item(i) : list[i];
    if (a && a.name.toLowerCase() === lower) {
      return a.value;
    }
  }
  return undefined;
}

function num(el, name) {
  const raw = attr(el, name);
  if (raw === undefined) {
    return undefined;
  }
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Element children of a node (nodeType 1), index-safe across DOM impls. */
function childElements(node) {
  const out = [];
  const kids = node.childNodes;
  if (!kids) {
    return out;
  }
  for (let i = 0; i < kids.length; i++) {
    const k = kids.item ? kids.item(i) : kids[i];
    if (k && k.nodeType === 1) {
      out.push(k);
    }
  }
  return out;
}

/** Every descendant element whose tag matches `tag` (case-insensitive). */
function elementsByTag(root, tag) {
  const lower = tag.toLowerCase();
  const list = root.getElementsByTagName("*");
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const el = list.item ? list.item(i) : list[i];
    if (el && el.tagName && el.tagName.toLowerCase() === lower) {
      out.push(el);
    }
  }
  return out;
}

/** Recursively flattens the <MarkerCategory> tree into dotted lower-case paths. */
function walkCategories(parent, prefix, out) {
  for (const el of childElements(parent)) {
    if (el.tagName.toLowerCase() !== "markercategory") {
      continue;
    }
    const name = (attr(el, "name") ?? "").toLowerCase();
    const dotted = prefix ? `${prefix}.${name}` : name;
    out.set(dotted, {
      displayName: attr(el, "DisplayName"),
      iconFile: attr(el, "iconFile"),
      color: attr(el, "color"),
    });
    walkCategories(el, dotted, out);
  }
}

/** Parses a TacO `.xml` overlay file into {pois, trails, categories}. */
function parseTacoXmlNode(xmlText) {
  // TacO packs frequently contain unescaped ampersands; repair any '&' that
  // doesn't already start a valid entity before parsing. (taco-parse.ts)
  const repaired = xmlText.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;");
  let fatal;
  const parser = new DOMParser({onError: (level, msg) => {
    if (level === "fatalError") {
      fatal = msg;
    }
  }});
  let doc;
  try {
    doc = parser.parseFromString(repaired, "text/xml");
  } catch (e) {
    throw new Error(`File is not valid XML: ${e instanceof Error ? e.message : e}`);
  }
  if (fatal || !doc || !doc.documentElement) {
    throw new Error(`File is not valid XML${fatal ? `: ${fatal}` : ""}`);
  }

  const categories = new Map();
  walkCategories(doc.documentElement, "", categories);

  const pois = [];
  for (const el of elementsByTag(doc, "POI")) {
    const mapId = num(el, "MapID");
    const x = num(el, "xpos");
    const z = num(el, "zpos");
    if (mapId === undefined || x === undefined || z === undefined) {
      continue;
    }
    pois.push({
      mapId,
      x,
      y: num(el, "ypos") ?? 0,
      z,
      type: attr(el, "type")?.toLowerCase(),
      name: attr(el, "name"),
      iconFile: attr(el, "iconFile"),
    });
  }

  const trails = [];
  for (const el of elementsByTag(doc, "Trail")) {
    trails.push({
      type: attr(el, "type")?.toLowerCase(),
      name: attr(el, "name"),
      color: attr(el, "color"),
      trailData: attr(el, "trailData"),
    });
  }

  return {pois, trails, categories};
}

/** Parses a `.trl` binary: uint32 version, int32 mapID, then float32 (x,y,z) per vertex. (taco-parse.ts) */
function parseTrlNode(buffer) {
  if (buffer.byteLength < 8 || (buffer.byteLength - 8) % 12 !== 0) {
    throw new Error("Malformed .trl file (unexpected length)");
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const mapId = view.getInt32(4, true);
  const count = (buffer.byteLength - 8) / 12;
  const points = [];
  for (let i = 0; i < count; i++) {
    const o = 8 + i * 12;
    points.push({
      x: view.getFloat32(o, true),
      y: view.getFloat32(o + 4, true),
      z: view.getFloat32(o + 8, true),
    });
  }
  return {mapId, points};
}

// --- coordinate conversion (verbatim from taco-convert.ts) ------------------

/** One world (x, z) in metres → continent pixel, for a single map's rects. */
function worldToContinent(x, z, info) {
  const mapX = x * INCHES_PER_METRE;
  const mapZ = z * INCHES_PER_METRE;
  const [[swX, swY], [neX, neY]] = info.map_rect;
  const [[nwX, nwY], [seX, seY]] = info.continent_rect;

  const fracX = (mapX - swX) / (neX - swX); // 0 west .. 1 east
  const fracZ = (mapZ - swY) / (neY - swY); // 0 south .. 1 north

  const continentX = nwX + fracX * (seX - nwX);
  // continent Y grows south while map Z grows north — the inversion is carried
  // by (nwY - seY) being negative (north pixel-Y < south pixel-Y).
  const continentY = seY + fracZ * (nwY - seY);
  return [continentX, continentY];
}

function placePoi(poi, maps) {
  const info = maps.get(poi.mapId);
  if (!info) {
    return undefined;
  }
  return {coord: worldToContinent(poi.x, poi.z, info), continentId: info.continent_id};
}

function placeTrail(trail, maps) {
  const info = maps.get(trail.mapId);
  if (!info) {
    return undefined;
  }
  return {points: trail.points.map(p => worldToContinent(p.x, p.z, info)), continentId: info.continent_id};
}

// --- grouping / labelling helpers (adapted from taco-import.ts) -------------

function cleanLeaf(name) {
  return name.replace(/^toggle\s+/i, "").replace(/_/g, " ").trim();
}

/** Ancestor group names; last element is the marker's immediate group. */
function groupPath(type, categories) {
  if (!type) {
    return ["Imported Markers"];
  }
  const parts = type.split(".");
  const ancestors = parts.slice(0, -1).map((_, i) => categories.get(parts.slice(0, i + 1).join("."))?.displayName ?? parts[i]);
  return ancestors.length ? ancestors : ["Imported Markers"];
}

/** Hover label: "<group> — <leaf>", e.g. "Crystal Oasis — Tazula". */
function markerTooltip(type, categories) {
  if (!type) {
    return undefined;
  }
  const group = groupPath(type, categories);
  const groupLabel = group[group.length - 1];
  const leaf = cleanLeaf(categories.get(type)?.displayName ?? type.split(".").pop() ?? "");
  if (!leaf) {
    return groupLabel;
  }
  return groupLabel && groupLabel !== "Imported Markers" ? `${groupLabel} — ${leaf}` : leaf;
}

/** Nearest-ancestor iconFile in the category chain (more specific wins). */
function iconForType(type, categories) {
  if (!type) {
    return undefined;
  }
  const parts = type.split(".");
  for (let i = parts.length; i > 0; i--) {
    const icon = categories.get(parts.slice(0, i).join("."))?.iconFile;
    if (icon) {
      return icon;
    }
  }
  return undefined;
}

/** Accepts a 6-digit hex (with/without #); ignores 8-digit ARGB to avoid channel guesswork. */
function normalizeColor(color) {
  if (!color) {
    return undefined;
  }
  const hex = color.trim().replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex}` : undefined;
}

/** Splits placed points into contiguous segments, breaking at (0,0,0) world vertices. */
function splitSegments(placed, world) {
  const segments = [];
  let current = [];
  for (let i = 0; i < placed.length; i++) {
    const w = world[i];
    const isBreak = Math.abs(w.x) < BREAK_EPSILON && Math.abs(w.y) < BREAK_EPSILON && Math.abs(w.z) < BREAK_EPSILON;
    if (isBreak) {
      if (current.length) {
        segments.push(current);
        current = [];
      }
      continue;
    }
    current.push(placed[i]);
  }
  if (current.length) {
    segments.push(current);
  }
  return segments;
}

// --- fetching / icons -------------------------------------------------------

/** Repo raw URL for a pack-relative path; each segment encoded (filenames have spaces). */
const rawUrl = (p) => `${TACO_REPO_RAW}/${p.split("/").map(encodeURIComponent).join("/")}`;

const round2 = (v) => Math.round(v * 100) / 100;
const roundCoord = ([x, y]) => [round2(x), round2(y)];

async function fetchText(p) {
  const buf = await fetchBuffer(rawUrl(p), {delayMs: 150});
  return buf.toString("utf8");
}

/** "Bounty.xml" -> "10_Menu_Bounty.xml" (spaces -> underscores). */
function deriveMenuFile(contentFile) {
  return `10_Menu_${contentFile.replace(/\.xml$/i, "").replace(/ /g, "_")}.xml`;
}

/**
 * Pack icon path -> local committed relative path (tidy tree under taco_icons,
 * Data/Images/ prefix stripped, each segment sanitized so the URL needs no
 * encoding). e.g. "Data/Images/Ranger Pets/Eagle.png" -> "Ranger_Pets/Eagle.png".
 */
function iconRelPath(packPath) {
  const stripped = packPath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^data\/images\//i, "");
  return stripped
    .split("/")
    .map(seg => decodeURIComponent(seg).replace(/[^A-Za-z0-9._-]/g, "_"))
    .join("/");
}

const EXCLUDE_CATEGORY_SEGMENTS = new Set(TACO_EXCLUDE_CATEGORY_SEGMENTS);

/** True when a marker is in an excluded category (by icon location OR category segment; see TACO_EXCLUDE_* in config.mjs). */
function isExcludedMarker(type, iconPackPath) {
  const rel = iconPackPath ? iconRelPath(iconPackPath) : undefined;
  if (rel && TACO_EXCLUDE_ICON_PREFIXES.some(p => rel.startsWith(p))) {
    return true;
  }
  if (type && type.split(".").some(seg => EXCLUDE_CATEGORY_SEGMENTS.has(seg))) {
    return true;
  }
  return false;
}

/** Records an icon for download and returns its public URL (or undefined). */
function registerIcon(packPath, icons) {
  if (!packPath) {
    return undefined;
  }
  const rel = iconRelPath(packPath);
  const existing = icons.get(rel);
  if (existing && existing !== packPath) {
    throw new Error(`icon name collision: "${packPath}" and "${existing}" both map to ${rel}`);
  }
  icons.set(rel, packPath);
  return `${ICON_URL_BASE}/${rel}`;
}

/** Downloads referenced icons (idempotent, paced); returns the set of failed rel paths. */
async function downloadIcons(icons) {
  let downloaded = 0;
  let skipped = 0;
  const failed = new Set();
  for (const [rel, packPath] of icons) {
    const target = path.join(ICON_DIR, ...rel.split("/"));
    if (existsSync(target) && statSync(target).size > 0) {
      skipped++;
      continue;
    }
    try {
      writeFileAtomic(target, await fetchBuffer(rawUrl(packPath), {delayMs: 150}));
      downloaded++;
    } catch (err) {
      failed.add(rel);
      log.warn(`icon download failed for ${packPath}:`, err instanceof Error ? err.message : String(err));
    }
  }
  log.info(`icons: ${downloaded} downloaded, ${skipped} already present, ${failed.size} failed (${icons.size} referenced) -> ${ICON_DIR}`);
  return failed;
}

// --- maps -------------------------------------------------------------------

/** id -> {continent_id, map_rect, continent_rect} for every map the API knows. */
async function loadMaps() {
  const list = await fetchJson(`${GW2_API}/maps?ids=all`);
  const maps = new Map();
  for (const m of list) {
    if (Array.isArray(m.map_rect) && Array.isArray(m.continent_rect)) {
      maps.set(m.id, {continent_id: m.continent_id, map_rect: m.map_rect, continent_rect: m.continent_rect});
    }
  }
  log.info(`loaded ${maps.size} maps with rects from the GW2 API`);
  return maps;
}

// --- per-file layer build ---------------------------------------------------

async function buildLayerForEntry(entry, maps, icons) {
  const menuFile = entry.menuFile ?? deriveMenuFile(entry.contentFile);
  const content = parseTacoXmlNode(await fetchText(entry.contentFile));
  const menu = parseTacoXmlNode(await fetchText(menuFile));
  // Content files have no <MarkerCategory>; labels/icons/colours live in the
  // menu file, so merge its category tree in (menu wins on overlap).
  const categories = new Map(content.categories);
  menu.categories.forEach((v, k) => categories.set(k, v));

  const features = [];
  let layerColor;
  let skippedUnknownMap = 0;
  let skippedOtherContinent = 0;
  let trailCount = 0;
  let skippedTrailsNoData = 0;
  let skippedExcluded = 0;

  for (const poi of content.pois) {
    const placed = placePoi(poi, maps);
    if (!placed) {
      skippedUnknownMap++;
      continue;
    }
    if (placed.continentId !== entry.continentId) {
      skippedOtherContinent++;
      continue;
    }
    const iconPackPath = poi.iconFile ?? iconForType(poi.type, categories);
    if (isExcludedMarker(poi.type, iconPackPath)) {
      skippedExcluded++;
      continue; // before registerIcon — excluded icons never get downloaded
    }
    const feature = {geometry: {type: "Point", coordinates: roundCoord(placed.coord)}};
    const name = poi.name ?? markerTooltip(poi.type, categories);
    if (name) {
      feature.name = name;
    }
    const iconUrl = registerIcon(iconPackPath, icons);
    if (iconUrl) {
      feature.icon = iconUrl;
    }
    features.push(feature);
  }

  if (entry.includeTrails) {
    for (const trail of content.trails) {
      if (isExcludedMarker(trail.type, undefined)) {
        skippedExcluded++;
        continue;
      }
      if (!trail.trailData) {
        skippedTrailsNoData++;
        continue;
      }
      let binary;
      try {
        binary = parseTrlNode(await fetchBuffer(rawUrl(trail.trailData), {delayMs: 150}));
      } catch (err) {
        log.warn(`skipping trail ${trail.trailData}:`, err instanceof Error ? err.message : String(err));
        skippedTrailsNoData++;
        continue;
      }
      const full = {...trail, mapId: binary.mapId, points: binary.points};
      const placed = placeTrail(full, maps);
      if (!placed) {
        skippedUnknownMap++;
        continue;
      }
      if (placed.continentId !== entry.continentId) {
        skippedOtherContinent++;
        continue;
      }
      layerColor = layerColor ?? normalizeColor(trail.color);
      const name = trail.name ?? markerTooltip(trail.type, categories);
      let added = false;
      for (const segment of splitSegments(placed.points, full.points)) {
        if (segment.length < 2) {
          continue;
        }
        const f = {geometry: {type: "LineString", coordinates: segment.map(roundCoord)}};
        if (name) {
          f.name = name;
        }
        features.push(f);
        added = true;
      }
      if (added) {
        trailCount++;
      }
    }
  }

  const id = "taco_" + entry.layerName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const skips = [];
  if (skippedUnknownMap) {
    skips.push(`${skippedUnknownMap} on unknown maps`);
  }
  if (skippedOtherContinent) {
    skips.push(`${skippedOtherContinent} on other continents`);
  }
  if (skippedTrailsNoData) {
    skips.push(`${skippedTrailsNoData} trails without data`);
  }
  if (skippedExcluded) {
    skips.push(`${skippedExcluded} excluded markers`);
  }
  log.info(`${entry.layerName}: ${features.length} features (${trailCount} trails)${skips.length ? ` — skipped ${skips.join(", ")}` : ""}`);

  return {
    id,
    name: entry.layerName,
    continentId: entry.continentId,
    color: layerColor ?? entry.colorFallback,
    // Optional second-level panel group (e.g. nest the 10 Gathering files under
    // a "Gathering" header) below the top-level pack group.
    group: entry.subgroup ? [PACK_GROUP, entry.subgroup] : [PACK_GROUP],
    features,
  };
}

// --- main -------------------------------------------------------------------

export async function main() {
  const maps = await loadMaps();
  const icons = new Map();
  const layers = [];
  for (const entry of TACO_TRAILS) {
    layers.push(await buildLayerForEntry(entry, maps, icons));
  }

  // Download icons, then drop any feature icon whose download failed so the
  // committed JSON never references a missing asset (it falls back to a dot).
  const failedRels = await downloadIcons(icons);
  if (failedRels.size) {
    for (const layer of layers) {
      for (const f of layer.features) {
        if (f.icon && failedRels.has(f.icon.slice(ICON_URL_BASE.length + 1))) {
          delete f.icon;
        }
      }
    }
  }

  const totalFeatures = layers.reduce((n, l) => n + l.features.length, 0);
  const floor = VALIDATION.taco_trails;
  // assertNotShrunk only sees the layer COUNT; guard the feature total too.
  if (totalFeatures < floor.minFeatures) {
    throw new Error(`taco_trails: only ${totalFeatures} features across ${layers.length} layers (below minFeatures ${floor.minFeatures}) — refusing to overwrite`);
  }
  writeJsonAtomic(OUT_FILE, layers, {
    validate: (d) => assertNotShrunk(d, readJsonIfExists(OUT_FILE), floor),
  });
  log.info(`wrote ${layers.length} TacO layers (${totalFeatures} features) -> ${OUT_FILE}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    log.error(err);
    process.exit(1);
  });
}
