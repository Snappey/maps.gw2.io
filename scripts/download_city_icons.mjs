// Downloads the wiki-hosted city marker icons referenced by
// src/assets/data/city_markers.json into src/assets/city_icons/.
//
// The GW2 wiki serves /images/ without CORS headers, so the OL renderer — which
// must load icons with crossOrigin (canvas hit detection) — can never fetch
// them directly; the map rewrites the URLs to these local copies via
// localIconSrc() in src/lib/ol/marker-styles.ts. Idempotent: existing non-empty
// files are skipped. Re-run whenever city_markers.json gains new icons:
//   npm run cache-city-icons

import {existsSync, statSync, readFileSync} from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {fetchBuffer} from "./lib/http.mjs";
import {writeFileAtomic} from "./lib/io.mjs";
import {log} from "./lib/log.mjs";
import {dataFile, assetPath} from "./config.mjs";

const DATA_FILE = dataFile("city_markers.json");
const OUT_DIR = assetPath("city_icons");

// Must stay in sync with localIconSrc() in src/lib/ol/marker-styles.ts.
const localName = (url) =>
  decodeURIComponent(url.split("/").pop()).replace(/[^A-Za-z0-9._-]/g, "_");

export async function main() {
  const markers = JSON.parse(readFileSync(DATA_FILE, "utf8"));
  const urls = [...new Set(markers.map((m) => m.icon).filter((u) => u && u.includes("wiki.guildwars2.com/images")))];

  const names = new Map();
  for (const url of urls) {
    const name = localName(url);
    if (names.has(name)) {
      throw new Error(`filename collision: ${url} and ${names.get(name)} both map to ${name}`);
    }
    names.set(name, url);
  }

  let downloaded = 0;
  let skipped = 0;
  for (const [name, url] of names) {
    const target = path.join(OUT_DIR, name);
    if (existsSync(target) && statSync(target).size > 0) {
      skipped++;
      continue;
    }
    writeFileAtomic(target, await fetchBuffer(url, {delayMs: 150})); // be polite to the wiki
    downloaded++;
  }
  log.info(`${downloaded} downloaded, ${skipped} already present, ${names.size} total in ${OUT_DIR}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    log.error(err);
    process.exit(1);
  });
}
