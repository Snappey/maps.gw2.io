// Builds the vector tile archives: generate_tiles.mjs emits MBTiles, then each
// is converted to PMTiles via the cross-platform go-pmtiles resolver (no
// hardcoded binary path). Replaces the old Windows-only `pmtiles convert` chain.
//   npm run build-tiles

import {pathToFileURL} from "node:url";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {convertMbtiles} from "./lib/pmtiles.mjs";
import {log} from "./lib/log.mjs";
import {ROOT, outFile, assetPath} from "./config.mjs";

const TILESETS = [
  {mbtiles: outFile("tyria_1_1.mbtiles"), pmtiles: assetPath("tiles", "tyria_1_1.pmtiles")},
  {mbtiles: outFile("mists_2_1.mbtiles"), pmtiles: assetPath("tiles", "mists_2_1.pmtiles")},
];

export function main() {
  // Run the tiler in a fresh subprocess so its native-module (better-sqlite3)
  // state is isolated and its exit code is unambiguous.
  const gen = spawnSync(process.execPath, [path.join(ROOT, "scripts", "generate_tiles.mjs")], {stdio: "inherit"});
  if (gen.error) throw gen.error;
  if (gen.status !== 0) {
    throw new Error(`generate_tiles.mjs exited with code ${gen.status}`);
  }

  for (const {mbtiles, pmtiles} of TILESETS) {
    convertMbtiles(mbtiles, pmtiles);
    log.info(`converted ${mbtiles} -> ${pmtiles}`);
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
