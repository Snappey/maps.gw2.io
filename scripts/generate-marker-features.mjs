// Emits the non-tiled marker feature sets the OpenLayers vector layers load
// directly, plus the chat-link deep-link index. Replaces the MVT/PMTiles path
// for markers: the whole archive was force-loaded into memory anyway, so tiling
// only added per-tile MVT decode cost on the main thread.
//
// Output per continent:
//   src/assets/data/markers_<name>_<c>_<f>.json  flat feature list (GW2 px)
//   src/assets/tiles/<name>_<c>_<f>.index.json   chat-link -> {coord, tooltip, type}
//
//   npm run build-marker-features

import {pathToFileURL} from "node:url";
import {writeJsonAtomic} from "./lib/io.mjs";
import {CONTINENTS, preflight} from "./lib/marker-features.mjs";
import {dataFile, assetPath} from "./config.mjs";
import {log} from "./lib/log.mjs";

// Drawn by the SVG LabelOverlays (region/map headings) or supplied at runtime by
// the WvW service (Mists objectives), so they are not part of the static feature
// set the vector layers render. Their chat-link entries still go in the index.
const EXCLUDED_LAYERS = new Set(["label_region", "label_map", "objective"]);

// {layer, geomType: 1|3, coords, props} -> {layer, geometry, ...props}. Point
// coords are [x, y]; polygon coords are a single ring [[x, y], …] wrapped as a
// one-ring polygon (matching the GeoJSON the client's buildMarkerFeatures reads).
const toFeature = ({layer, geomType, coords, props}) => ({
  layer,
  geometry: geomType === 1
    ? {type: "Point", coordinates: coords}
    : {type: "Polygon", coordinates: [coords]},
  ...props,
});

export function main() {
  preflight();

  for (const continent of CONTINENTS) {
    const {features, chatLinkIndex} = continent.collect(continent);

    const rendered = features.filter(f => !EXCLUDED_LAYERS.has(f.layer));
    const counts = {};
    for (const f of rendered) {
      counts[f.layer] = (counts[f.layer] ?? 0) + 1;
    }

    const stem = `${continent.name}_${continent.continentId}_${continent.floorId}`;
    const markerFile = dataFile(`markers_${stem}.json`);
    writeJsonAtomic(markerFile, rendered.map(toFeature));
    log.info(`[${continent.name}] ${rendered.length} features ${JSON.stringify(counts)} -> ${markerFile}`);

    const indexFile = assetPath("tiles", `${stem}.index.json`);
    writeJsonAtomic(indexFile, chatLinkIndex);
    log.info(`[${continent.name}] chat-link index (${Object.keys(chatLinkIndex).length} entries) -> ${indexFile}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (err) {
    log.error(err);
    process.exit(1);
  }
}
