// Cross-platform go-pmtiles resolution + invocation, so build-tiles works in CI
// and on any developer machine without a hardcoded binary path.

import {existsSync} from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const SCRIPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Resolution order: PMTILES_BIN env -> `pmtiles` on PATH -> gitignored
// scripts/bin copy. Throws an actionable install message if none is found.
export function resolvePmtilesBin() {
  const fromEnv = process.env.PMTILES_BIN;
  if (fromEnv) {
    if (!existsSync(fromEnv)) {
      throw new Error(`PMTILES_BIN is set to "${fromEnv}" but that file does not exist`);
    }
    return fromEnv;
  }

  const onPath = findOnPath("pmtiles");
  if (onPath) return onPath;

  const local = path.join(SCRIPTS_DIR, "bin", process.platform === "win32" ? "pmtiles.exe" : "pmtiles");
  if (existsSync(local)) return local;

  throw new Error(
    "go-pmtiles CLI not found. Install it so `pmtiles` is on PATH, set PMTILES_BIN to the binary, " +
      "or drop it in scripts/bin/. Releases: https://github.com/protomaps/go-pmtiles/releases " +
      "(or `go install github.com/protomaps/go-pmtiles/main@latest`).",
  );
}

function findOnPath(name) {
  const exts = process.platform === "win32"
    ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
    : [""];
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

// Convert an MBTiles archive to PMTiles, throwing on a non-zero exit.
export function convertMbtiles(src, dest) {
  const bin = resolvePmtilesBin();
  const result = spawnSync(bin, ["convert", src, dest], {stdio: "inherit"});
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`pmtiles convert exited with code ${result.status} (${src} -> ${dest})`);
  }
}
