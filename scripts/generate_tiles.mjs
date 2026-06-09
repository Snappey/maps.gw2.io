// Generates vector tiles (MBTiles -> PMTiles via go-pmtiles) for the OpenLayers
// map from the JSON assets produced by the cache-* scripts.
//
// The tile grid is, by construction, the GW2 raster grid: 256px tiles in
// continent pixel coordinates (origin top-left, y down), resolution 2^(maxZoom-z).
// MVT local coords are also y-down, so no axis flips happen here at all; the
// only y flip in the whole stack lives in src/lib/ol/gw2-projection.ts.
//
// Usage: node scripts/generate_tiles.mjs
import Database from "better-sqlite3";
import vtpbf from "vt-pbf";
import * as lineclipModule from "lineclip";
const lineclip = lineclipModule.default ?? lineclipModule;
import {gzipSync} from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, "src/assets/data", file), "utf8"));

const EXTENT = 4096;
const TILE_SIZE = 256;

// PMTiles requires the standard square pyramid (x,y < 2^z), but the GW2 grid is
// 320x448 tiles at native z7. Tiles are therefore stored at PMTiles z+OFFSET
// (448 <= 2^9); the OL vector tile grid mirrors this with a resolutions array of
// maxZoom+OFFSET+1 entries (see createVectorTileGrid in gw2-projection.ts).
const ZOOM_OFFSET = 2;

// [minZoom, maxZoom] a layer's features are written into; mirrors the display
// thresholds registered in the map components so low-zoom tiles stay tiny.
// bufferPx is the inclusion buffer in *screen* pixels around each tile, so
// icons/labels straddling a tile border render on both sides (declutter
// collapses the duplicates).
const TYRIA_LAYERS = {
  waypoint:      {zoom: [5, 7], bufferPx: 32},
  poi:           {zoom: [6, 7], bufferPx: 32},
  vista:         {zoom: [6, 7], bufferPx: 32},
  unlock:        {zoom: [4, 7], bufferPx: 32},
  heart:         {zoom: [6, 7], bufferPx: 32},
  heart_bounds:  {zoom: [6, 7], bufferPx: 32},
  heropoint:     {zoom: [6, 7], bufferPx: 32},
  mastery:       {zoom: [6, 7], bufferPx: 32},
  adventure:     {zoom: [6, 7], bufferPx: 32},
  city:          {zoom: [7, 7], bufferPx: 64},
  label_sector:  {zoom: [7, 7], bufferPx: 256},
  sector_bounds: {zoom: [7, 7], bufferPx: 32},
  label_region:  {zoom: [2, 5], bufferPx: 1024},
  label_map:     {zoom: [3, 5], bufferPx: 512},
};

// The old Leaflet mists map registers everything with minZoomLevel 0 except
// waypoints; the view never goes below zoom 4 anyway.
const MISTS_LAYERS = {
  waypoint:      {zoom: [4, 7], bufferPx: 32},
  objective:     {zoom: [4, 7], bufferPx: 48},
  sector_bounds: {zoom: [4, 7], bufferPx: 32},
  label_map:     {zoom: [4, 7], bufferPx: 512},
};

const CONTINENTS = [
  {
    name: "tyria",
    continentId: 1,
    floorId: 1,
    width: 81920,
    height: 114688,
    maxZoom: 7, // coordinate scale; matches Gw2MapConfig.maxZoom
    layers: TYRIA_LAYERS,
    collect: collectTyriaFeatures,
  },
  {
    name: "mists",
    continentId: 2,
    floorId: 1,
    width: 16384,
    height: 16384,
    maxZoom: 7, // mists coords are zoom-7 scaled even though raster stops at 6
    layers: MISTS_LAYERS,
    collect: collectMistsFeatures,
  },
];

const trimChatLink = (link) => link?.replace(/^\[/, "").replace(/\]$/, "").replace(/=+$/, "");

// --- Feature collection -----------------------------------------------------

function collectTyriaFeatures(continent) {
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

function collectMistsFeatures(continent) {
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

// --- Tiling ------------------------------------------------------------------

// MVT spec: exterior rings clockwise in y-down tile space.
function signedArea(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += (ring[j][0] - ring[i][0]) * (ring[i][1] + ring[j][1]);
  }
  return area / 2;
}

function buildTiles(continent, features) {
  const tiles = new Map(); // "z/x/y" -> {layerName -> features[]}

  const addToTile = (z, tx, ty, layer, feature) => {
    const key = `${z}/${tx}/${ty}`;
    let layers = tiles.get(key);
    if (!layers) {
      tiles.set(key, layers = {});
    }
    (layers[layer] ??= []).push(feature);
  };

  for (let z = 0; z <= continent.maxZoom; z++) {
    const res = 2 ** (continent.maxZoom - z);
    const span = TILE_SIZE * res; // world px per tile
    const maxTx = Math.ceil(continent.width / span) - 1;
    const maxTy = Math.ceil(continent.height / span) - 1;
    const toLocal = (tx, ty, [x, y]) =>
      [Math.round((x - tx * span) * EXTENT / span), Math.round((y - ty * span) * EXTENT / span)];

    for (const f of features) {
      const def = continent.layers[f.layer];
      if (z < def.zoom[0] || z > def.zoom[1]) continue;
      const buf = def.bufferPx * res;

      if (f.geomType === 1) {
        const [x, y] = f.coords;
        const minTx = Math.max(0, Math.floor((x - buf) / span));
        const maxTxF = Math.min(maxTx, Math.floor((x + buf) / span));
        const minTy = Math.max(0, Math.floor((y - buf) / span));
        const maxTyF = Math.min(maxTy, Math.floor((y + buf) / span));
        for (let tx = minTx; tx <= maxTxF; tx++) {
          for (let ty = minTy; ty <= maxTyF; ty++) {
            addToTile(z, tx, ty, f.layer, {type: 1, geometry: [toLocal(tx, ty, f.coords)], tags: f.props});
          }
        }
      } else {
        const xs = f.coords.map(c => c[0]);
        const ys = f.coords.map(c => c[1]);
        const minTx = Math.max(0, Math.floor((Math.min(...xs) - buf) / span));
        const maxTxF = Math.min(maxTx, Math.floor((Math.max(...xs) + buf) / span));
        const minTy = Math.max(0, Math.floor((Math.min(...ys) - buf) / span));
        const maxTyF = Math.min(maxTy, Math.floor((Math.max(...ys) + buf) / span));
        for (let tx = minTx; tx <= maxTxF; tx++) {
          for (let ty = minTy; ty <= maxTyF; ty++) {
            const bbox = [tx * span - buf, ty * span - buf, (tx + 1) * span + buf, (ty + 1) * span + buf];
            const clipped = lineclip.clipPolygon(f.coords, bbox);
            if (clipped.length < 3) continue;
            let ring = clipped.map(c => toLocal(tx, ty, c));
            if (signedArea(ring) > 0) { // y-down: CW exterior has negative signed area here
              ring = ring.reverse();
            }
            const first = ring[0];
            const last = ring[ring.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) {
              ring = [...ring, first];
            }
            addToTile(z, tx, ty, f.layer, {type: 3, geometry: [ring], tags: f.props});
          }
        }
      }
    }
  }

  return tiles;
}

// --- Output ------------------------------------------------------------------

function writeMbtiles(continent, tiles, outFile) {
  fs.mkdirSync(path.dirname(outFile), {recursive: true});
  fs.rmSync(outFile, {force: true});
  const db = new Database(outFile);
  db.pragma("journal_mode = OFF");
  db.exec(`
    CREATE TABLE metadata (name TEXT, value TEXT);
    CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);
    CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row);
  `);

  const vectorLayers = Object.keys(continent.layers).map(id =>
    ({id, fields: {}, minzoom: continent.layers[id].zoom[0], maxzoom: continent.layers[id].zoom[1]}));
  const metadata = {
    name: `gw2-${continent.name}`,
    format: "pbf",
    minzoom: String(ZOOM_OFFSET),
    maxzoom: String(continent.maxZoom + ZOOM_OFFSET),
    // Geographic bounds are meaningless for the pixel CRS but required by tooling.
    bounds: "-180,-85,180,85",
    json: JSON.stringify({vector_layers: vectorLayers, "gw2:projection": `pixels ${continent.width}x${continent.height} maxZoom ${continent.maxZoom}`}),
  };
  const insertMeta = db.prepare("INSERT INTO metadata VALUES (?, ?)");
  for (const [name, value] of Object.entries(metadata)) {
    insertMeta.run(name, value);
  }

  const insertTile = db.prepare("INSERT INTO tiles VALUES (?, ?, ?, ?)");
  let count = 0;
  const insertAll = db.transaction(() => {
    for (const [key, layers] of tiles) {
      const [z, x, y] = key.split("/").map(Number);
      const layersForPbf = {};
      for (const [name, feats] of Object.entries(layers)) {
        layersForPbf[name] = {features: feats, extent: EXTENT};
      }
      const pbf = vtpbf.fromGeojsonVt(layersForPbf, {version: 2, extent: EXTENT});
      const pmZ = z + ZOOM_OFFSET;
      const tmsRow = (2 ** pmZ) - 1 - y; // MBTiles is TMS (y flipped)
      insertTile.run(pmZ, x, tmsRow, gzipSync(Buffer.from(pbf), {level: 9}));
      count++;
    }
  });
  insertAll();
  db.close();
  return count;
}

// --- Main ---------------------------------------------------------------------

for (const continent of CONTINENTS) {
  const {features, chatLinkIndex} = continent.collect(continent);
  const counts = {};
  for (const f of features) {
    counts[f.layer] = (counts[f.layer] ?? 0) + 1;
  }
  console.log(`[${continent.name}] features:`, counts);

  const tiles = buildTiles(continent, features);
  const mbtiles = path.join(ROOT, "scripts/out", `${continent.name}_${continent.continentId}_${continent.floorId}.mbtiles`);
  const written = writeMbtiles(continent, tiles, mbtiles);
  console.log(`[${continent.name}] wrote ${written} tiles -> ${mbtiles}`);

  const indexFile = path.join(ROOT, "src/assets/tiles", `${continent.name}_${continent.continentId}_${continent.floorId}.index.json`);
  fs.mkdirSync(path.dirname(indexFile), {recursive: true});
  fs.writeFileSync(indexFile, JSON.stringify(chatLinkIndex));
  console.log(`[${continent.name}] chat-link index (${Object.keys(chatLinkIndex).length} entries) -> ${indexFile}`);
}
