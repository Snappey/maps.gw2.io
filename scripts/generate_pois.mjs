// Generates the POI/label data the maps load
// (src/assets/data/poi_labels_{continent}_{floor}.json) from the GW2 API
// continents/floors endpoint, merged with the hand-curated static seed labels.
// A failed fetch or a collapsed result fails the run and leaves the committed
// file untouched (atomic write + shrink gate).
//   npm run cache-poi

import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {fetchJson} from "./lib/http.mjs";
import {writeJsonAtomic, readJsonIfExists} from "./lib/io.mjs";
import {assertNotShrunk} from "./lib/validate.mjs";
import {log} from "./lib/log.mjs";
import {GW2_API, POI_FLOORS, POI_OVERRIDES, VALIDATION, dataFile, staticFile} from "./config.mjs";

const getContinent = (id, floor) => fetchJson(`${GW2_API}/continents/${id}/floors/${floor}`);

const getStaticTyriaLabels = () => JSON.parse(readFileSync(staticFile("poi_labels.json"), "utf8"));

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

async function generate(continentId, floorIds, validation) {
  const labels = getStaticTyriaLabels();

  for (const floorId of floorIds) {
    const details = await getContinent(continentId, floorId);

    for (const region of Object.values(details.regions)) {
      log.info(region.name);

      for (const map of Object.values(region.maps)) {
        for (const skillpoint of map.skill_challenges) {
          if (skillpoint.id === "") continue;
          labels.push({
            id: skillpoint.id,
            coordinates: skillpoint.coord,
            type: "skillpoint",
            map: map.name,
            continent: region.name,
          });
        }

        for (const heart of Object.values(map.tasks)) {
          if (heart.id === 0) continue;
          labels.push({
            id: heart.id,
            coordinates: heart.coord,
            type: "heart",
            map: map.name,
            continent: region.name,
            data: {tooltip: heart.objective, chat_link: heart.chat_link, bounds: heart.bounds},
          });
        }

        for (const mastery of Object.values(map.mastery_points)) {
          if (mastery.id === 0) continue;
          labels.push({
            id: mastery.id,
            coordinates: mastery.coord,
            type: "mastery",
            map: map.name,
            continent: region.name,
            data: {type: mastery.region !== "Unknown" ? mastery.region : region.name},
          });
        }

        for (const poi of Object.values(map.points_of_interest)) {
          if (poi.id === 0) continue;
          if (has(POI_OVERRIDES, poi.id)) poi.name = POI_OVERRIDES[poi.id];
          labels.push({
            id: poi.id,
            coordinates: poi.coord,
            type: poi.type,
            map: map.name,
            continent: region.name,
            data: {icon: poi.icon, tooltip: poi.name, chat_link: poi.chat_link},
          });
        }

        for (const sector of Object.values(map.sectors)) {
          labels.push({
            id: sector.id,
            coordinates: sector.coord,
            type: "sector",
            map: map.name,
            continent: region.name,
            // chat_link omitted: it clashes with actual points of interest.
            data: {tooltip: sector.name, level: sector.level, bounds: sector.bounds},
          });
        }
      }
    }
  }

  const out = dataFile(`poi_labels_${continentId}_${floorIds[0]}.json`);
  writeJsonAtomic(out, labels, {
    validate: (data) => assertNotShrunk(data, readJsonIfExists(out), validation),
  });
  log.info(`wrote ${labels.length} labels -> ${out}`);
}

export async function main() {
  const jobs = [
    {continentId: 1, floorIds: POI_FLOORS[1], validation: VALIDATION.poi_1_1},
    {continentId: 2, floorIds: POI_FLOORS[2], validation: VALIDATION.poi_2_1},
  ];

  const failures = [];
  for (const job of jobs) {
    try {
      await generate(job.continentId, job.floorIds, job.validation);
    } catch (err) {
      failures.push(job.continentId);
      log.error(`continent ${job.continentId} POIs failed:`, err);
    }
  }
  if (failures.length) {
    throw new Error(`POI generation failed for continent(s): ${failures.join(", ")}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    log.error(err);
    process.exit(1);
  });
}
