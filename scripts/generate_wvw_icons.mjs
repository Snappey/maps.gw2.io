// Caches the WvW icons in src/assets/wvw/: a local copy of every neutral
// render-API objective marker referenced by src/assets/data/mists_objectives.json
// (so the map never hotlinks render.guildwars2.com) plus a few extra UI icons.
// Team-coloured objective icons are the hand-made src/assets/{type}_{team}.png
// set. Idempotent: existing non-empty files are skipped. Re-run whenever
// mists_objectives.json gains new markers:
//   npm run cache-wvw-icons
//
// Output naming (consumed by wvwMarkerSrc() in src/lib/ol/mists-layers.ts):
//   {fileId}.png   neutral copy of the render marker

import {existsSync, statSync, readFileSync} from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import pngjs from "pngjs";
import {fetchBuffer} from "./lib/http.mjs";
import {writeFileAtomic} from "./lib/io.mjs";
import {log} from "./lib/log.mjs";
import {dataFile, assetPath, WVW_EXTRA_ICONS} from "./config.mjs";

const {PNG} = pngjs;
const DATA_FILE = dataFile("mists_objectives.json");
const OUT_DIR = assetPath("wvw");

const fileId = (url) => url.split("/").pop().replace(/\.png$/i, "");

export async function main() {
  const objectives = JSON.parse(readFileSync(DATA_FILE, "utf8"));
  const markers = [...new Set(objectives.map((o) => o.marker).filter(Boolean))]
    .map((url) => ({url, name: fileId(url)}));

  let downloaded = 0;
  let skipped = 0;
  for (const {url, name} of [...markers, ...WVW_EXTRA_ICONS]) {
    const target = path.join(OUT_DIR, `${name}.png`);
    if (existsSync(target) && statSync(target).size > 0) {
      skipped++;
      continue;
    }
    // Re-encode through pngjs so every cached marker is a clean, uniform PNG.
    const png = PNG.sync.read(await fetchBuffer(url, {delayMs: 150})); // be polite to the render API
    writeFileAtomic(target, PNG.sync.write(png));
    downloaded++;
  }
  log.info(`${downloaded} markers processed, ${skipped} already present, output in ${OUT_DIR}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    log.error(err);
    process.exit(1);
  });
}
