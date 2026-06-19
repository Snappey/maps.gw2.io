// Marker-feature collection: maps the cache-* JSON assets to a flat list of map
// features (one per waypoint/POI/sector/…) plus the chat-link deep-link index.
// Consumed by generate-marker-features.mjs, which writes them as the non-tiled
// JSON the OpenLayers vector layers load directly.
//
// Each feature is the intermediate shape {layer, geomType: 1|3, coords, props}:
// `layer` is the source-layer name (the discriminator the OL styles branch on),
// geomType is the geometry type (1 = point, 3 = polygon), coords are GW2
// continent pixels, and props are baked onto the feature verbatim.

import fs from "node:fs";
import {dataFile} from "../config.mjs";
import {assertNonEmptyArray} from "./validate.mjs";

const DATA = (file) => JSON.parse(fs.readFileSync(dataFile(file), "utf8"));

// Every JSON input the collect functions read. Validated up front so a missing
// or empty file (a cache-* step skipped or failed) aborts before we emit
// half-empty output over the committed archives/files.
const REQUIRED_INPUTS = [
  "poi_labels_1_1.json",
  "poi_labels_2_1.json",
  "region_labels_1_1.json",
  "adventure_labels.json",
  "city_markers.json",
  "mists_objectives.json",
];

export function preflight() {
  for (const file of REQUIRED_INPUTS) {
    if (!fs.existsSync(dataFile(file))) {
      throw new Error(`missing marker input src/assets/data/${file} — run the cache-* scripts first`);
    }
    assertNonEmptyArray(DATA(file), file);
  }
}

export const trimChatLink = (link) => link?.replace(/^\[/, "").replace(/\]$/, "").replace(/=+$/, "");

// --- Feature collection -----------------------------------------------------

export function collectTyriaFeatures(continent) {
  const features = []; // {layer, geomType: 1|3, coords, props}
  const point = (layer, coords, props) => features.push({layer, geomType: 1, coords, props});
  const polygon = (layer, ring, props) => features.push({layer, geomType: 3, coords: ring, props});
  const chatLinkIndex = {};
  const indexEntry = (label, type, tooltip) => {
    const key = trimChatLink(label.data?.chat_link);
    if (key) {
      chatLinkIndex[key] = {coord: label.coordinates, tooltip, type};
    }
  };

  for (const label of DATA(`poi_labels_${continent.continentId}_${continent.floorId}.json`)) {
    if (!label.coordinates) continue;
    const d = label.data ?? {};
    switch (label.type) {
      case "waypoint":
        point("waypoint", label.coordinates, {id: label.id, tooltip: d.tooltip ?? "", chat_link: d.chat_link ?? ""});
        indexEntry(label, "waypoint", d.tooltip ?? "");
        break;
      case "landmark":
        point("poi", label.coordinates, {id: label.id, tooltip: d.tooltip ?? "", chat_link: d.chat_link ?? ""});
        indexEntry(label, "poi", d.tooltip ?? "");
        break;
      case "vista":
        point("vista", label.coordinates, {id: label.id, tooltip: "Vista", chat_link: d.chat_link ?? ""});
        indexEntry(label, "vista", "Vista");
        break;
      case "unlock":
        point("unlock", label.coordinates, {id: label.id, tooltip: d.tooltip ?? "", chat_link: d.chat_link ?? "", icon: d.icon ?? ""});
        indexEntry(label, "unlock", d.tooltip ?? "");
        break;
      case "heart":
        point("heart", label.coordinates, {id: label.id, tooltip: d.tooltip ?? "", chat_link: d.chat_link ?? ""});
        indexEntry(label, "heart", d.tooltip ?? "");
        if (Array.isArray(d.bounds) && d.bounds.length > 2) {
          polygon("heart_bounds", d.bounds, {heart_id: label.id});
        }
        break;
      case "skillpoint":
        point("heropoint", label.coordinates, {id: String(label.id), tooltip: "Skillpoint"});
        break;
      case "mastery":
        point("mastery", label.coordinates, {id: label.id, region: d.type ?? "Tyria"});
        break;
      case "sector":
        point("label_sector", label.coordinates, {id: label.id, tooltip: d.tooltip ?? "", chat_link: d.chat_link ?? "", level: d.level ?? 0});
        if (Array.isArray(d.bounds) && d.bounds.length > 2) {
          polygon("sector_bounds", d.bounds, {id: label.id, tooltip: d.tooltip ?? "", chat_link: d.chat_link ?? ""});
        }
        break;
    }
  }

  for (const label of DATA(`region_labels_${continent.continentId}_${continent.floorId}.json`)) {
    if (!label.label_coordinates) continue;
    if (label.type.toLowerCase() === "region") {
      point("label_region", label.label_coordinates, {heading: label.heading ?? ""});
    } else if (label.type.toLowerCase() === "map") {
      point("label_map", label.label_coordinates, {heading: label.heading ?? "", subheading: label.subheading ?? ""});
    }
  }

  if (continent.continentId === 1) {
    for (const label of DATA("adventure_labels.json")) {
      if (!label.coordinates) continue;
      point("adventure", label.coordinates, {name: String(label.id), tooltip: label.data?.tooltip ?? "", url: label.data?.url ?? ""});
    }
    for (const label of DATA("city_markers.json")) {
      if (!label.coord) continue;
      const name = (label.text ?? label.name ?? "").replaceAll(/([\[\]])*/g, "");
      point("city", label.coord, {name, icon: label.icon ?? ""});
    }
  }

  return {features, chatLinkIndex};
}

const EDGE_OF_THE_MISTS_MAP_ID = 968;
const OBSIDIAN_SANCTUM_SECTOR_ID = 1031;

// Mirrors layer.service.ts mistsMatchHeadings (hardcoded in the Leaflet app).
const MISTS_HEADINGS = [
  {coord: [10600, 12750], heading: "Eternal Battlegrounds"},
  {coord: [10800, 8700], heading: "Red Desert Borderlands"},
  {coord: [14100, 10700], heading: "Blue Alpine Borderlands"},
  {coord: [6900, 11450], heading: "Green Alpine Borderlands"},
];

const interpolate = (start, end, t) =>
  [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t];

export function collectMistsFeatures(continent) {
  const features = [];
  const point = (layer, coords, props) => features.push({layer, geomType: 1, coords, props});
  const polygon = (layer, ring, props) => features.push({layer, geomType: 3, coords: ring, props});
  const chatLinkIndex = {};

  for (const label of DATA(`poi_labels_${continent.continentId}_${continent.floorId}.json`)) {
    if (!label.coordinates) continue;
    const d = label.data ?? {};
    if (label.type === "waypoint") {
      point("waypoint", label.coordinates, {id: label.id, tooltip: d.tooltip ?? "", chat_link: d.chat_link ?? ""});
      const key = trimChatLink(d.chat_link);
      if (key) {
        chatLinkIndex[key] = {coord: label.coordinates, tooltip: d.tooltip ?? "", type: "waypoint"};
      }
    } else if (label.type === "sector"
      && label.continent === "World vs. World"
      && label.map !== "Edge of the Mists"
      && label.id !== OBSIDIAN_SANCTUM_SECTOR_ID
      && Array.isArray(d.bounds) && d.bounds.length > 2) {
      // Shrink 3% toward the sector label like the Leaflet map, so adjacent
      // sector outlines don't sit on top of each other.
      const ring = d.bounds.map(coords => interpolate(label.coordinates, coords, .97));
      polygon("sector_bounds", ring, {id: label.id, tooltip: d.tooltip ?? ""});
    }
  }

  for (const obj of DATA("mists_objectives.json")) {
    if (!obj.coord || obj.map_id === EDGE_OF_THE_MISTS_MAP_ID) continue;
    point("objective", obj.coord, {
      id: obj.id,
      name: obj.name ?? "",
      type: obj.type ?? "",
      sector_id: obj.sector_id ?? 0,
      map_id: obj.map_id ?? 0,
      marker: obj.marker ?? "",
      chat_link: obj.chat_link ?? "",
    });
    const key = trimChatLink(obj.chat_link);
    if (key) {
      chatLinkIndex[key] = {coord: obj.coord, tooltip: obj.name ?? "", type: "objective"};
    }
  }

  for (const label of MISTS_HEADINGS) {
    point("label_map", label.coord, {heading: label.heading, subheading: ""});
  }

  return {features, chatLinkIndex};
}

// Continent geometry + collector, consumed by generate-marker-features.mjs.
export const CONTINENTS = [
  {
    name: "tyria",
    continentId: 1,
    floorId: 1,
    width: 81920,
    height: 114688,
    maxZoom: 7, // coordinate scale; matches Gw2MapConfig.maxZoom
    collect: collectTyriaFeatures,
  },
  {
    name: "mists",
    continentId: 2,
    floorId: 1,
    width: 16384,
    height: 16384,
    maxZoom: 7, // mists coords are zoom-7 scaled even though raster stops at 6
    collect: collectMistsFeatures,
  },
];
