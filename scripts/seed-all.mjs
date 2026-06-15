// Orchestrates the full seeding pipeline in dependency order with one command:
//   npm run seed                          # everything
//   npm run seed -- --only=poi,regions    # just those domains
//
// Stages run in sequence; domains within a stage run concurrently. Any domain
// failure stops the pipeline with a non-zero exit (atomic writes mean a failed
// domain never commits partial data). Every domain is also runnable on its own
// via its cache-* npm script; this just sequences them, and --only is where a
// future CI job graph plugs in.

import {pathToFileURL} from "node:url";
import {log} from "./lib/log.mjs";

// Lazy imports so a single-domain run doesn't load every script's deps.
const DOMAINS = {
  poi: () => import("./generate_pois.mjs"),
  regions: () => import("./generate_regions.mjs"),
  extras: () => import("./generate_extras.mjs"),
  "event-timers": () => import("./generate_event_timers.mjs"),
  "city-icons": () => import("./download_city_icons.mjs"),
  "wvw-icons": () => import("./generate_wvw_icons.mjs"),
  tiles: () => import("./build-tiles.mjs"),
};

// Dependency stages: each completes before the next begins.
//   A: JSON from the GW2 API + wiki
//   B: icons referenced by that JSON (city-icons needs extras' city_markers.json)
//   C: vector tiles built from all the JSON
const STAGES = [
  ["poi", "regions", "extras", "event-timers"],
  ["city-icons", "wvw-icons"],
  ["tiles"],
];

async function runDomain(name) {
  log.info(`--- ${name} ---`);
  const mod = await DOMAINS[name]();
  await mod.main();
}

function parseOnly(argv) {
  const arg = argv.find((a) => a.startsWith("--only="));
  if (!arg) return null;
  const names = arg.slice("--only=".length).split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = names.filter((n) => !(n in DOMAINS));
  if (unknown.length) {
    throw new Error(`unknown domain(s): ${unknown.join(", ")}. Valid: ${Object.keys(DOMAINS).join(", ")}`);
  }
  return new Set(names);
}

export async function main(argv = process.argv.slice(2)) {
  const only = parseOnly(argv);
  const selected = (name) => !only || only.has(name);

  for (const stage of STAGES) {
    const todo = stage.filter(selected);
    if (todo.length === 0) continue;

    const results = await Promise.allSettled(todo.map(runDomain));
    const failed = [];
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        failed.push(todo[i]);
        log.error(`${todo[i]} failed:`, r.reason);
      }
    });
    if (failed.length) {
      throw new Error(`pipeline stopped at stage [${stage.join(", ")}]: ${failed.join(", ")} failed`);
    }
  }
  log.info("seeding pipeline complete");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    log.error(err);
    process.exit(1);
  });
}
