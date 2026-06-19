// Generates region/map heading labels (src/assets/data/region_labels_{c}_{f}.json)
// from the GW2 API, merged with the hand-curated static seed for Tyria. Each map
// needs its own detail fetch, so requests are paced and retried on transient
// failures. A failed fetch or collapsed result fails the run without clobbering
// the committed file (atomic write + shrink gate).
//   npm run cache-regions

import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {fetchJson} from "./lib/http.mjs";
import {writeJsonAtomic, readJsonIfExists} from "./lib/io.mjs";
import {assertNotShrunk} from "./lib/validate.mjs";
import {log} from "./lib/log.mjs";
import {
  GW2_API,
  REGION_BLACKLIST,
  CONTINENT_MAP_FILTER,
  VALIDATION,
  dataFile,
  staticFile,
} from "./config.mjs";

const getContinent = (id, floor) => fetchJson(`${GW2_API}/continents/${id}/floors/${floor}`);
const getMap = (id) => fetchJson(`${GW2_API}/maps/${id}`, {delayMs: 500}); // pace per-map calls

function getStaticTyriaLabels() {
  const seed = JSON.parse(readFileSync(staticFile("map_text.json"), "utf8"));
  return seed.map((label) => ({
    type: label.type,
    label_coordinates: label.coordinates,
    coordinates: null,
    heading: label.data.heading,
    subheading: label.data.subheading,
  }));
}

function mapSubheading(map) {
  if (map.min_level === 0 || map.min_level === map.max_level) {
    return `${map.max_level}`;
  }
  return map.min_level !== 0 ? `${map.min_level} - ${map.max_level}` : "";
}

async function generate(continentId, floorId, validation) {
  const details = await getContinent(continentId, floorId);
  let labels = [];

  if (continentId === 1 && floorId === 1) {
    labels = getStaticTyriaLabels();
  }

  for (const region of Object.values(details.regions)) {
    log.info(region.name);

    if (!REGION_BLACKLIST.has(region.name)) {
      labels.push({
        type: "Region",
        label_coordinates: region.label_coord,
        coordinates: region.continent_rect,
        heading: region.name,
        subheading: "",
      });
    }

    for (const map of Object.values(region.maps)) {
      const mapDetails = await getMap(map.id);
      log.info("| " + mapDetails.name);

      if (CONTINENT_MAP_FILTER[continentId](mapDetails) && !REGION_BLACKLIST.has(mapDetails.name)) {
        labels.push({
          type: "Map",
          label_coordinates: map.label_coord,
          coordinates: mapDetails.continent_rect,
          heading: mapDetails.name,
          sectors: mapDetails.sectors,
          subheading: mapSubheading(mapDetails),
        });
      }
    }
  }

  const out = dataFile(`region_labels_${continentId}_${floorId}.json`);
  writeJsonAtomic(out, labels, {
    validate: (data) => assertNotShrunk(data, readJsonIfExists(out), validation),
  });
  log.info(`wrote ${labels.length} labels -> ${out}`);
}

export async function main() {
  const jobs = [
    {continentId: 1, floorId: 1, validation: VALIDATION.region_1_1},
    {continentId: 2, floorId: 1, validation: VALIDATION.region_2_1},
  ];

  const failures = [];
  for (const job of jobs) {
    try {
      await generate(job.continentId, job.floorId, job.validation);
    } catch (err) {
      failures.push(job.continentId);
      log.error(`continent ${job.continentId} regions failed:`, err);
    }
  }
  if (failures.length) {
    throw new Error(`region generation failed for continent(s): ${failures.join(", ")}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    log.error(err);
    process.exit(1);
  });
}
