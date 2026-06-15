# Data generation (seeding)

The overlay data the maps load — `src/assets/data/*.json`, `src/assets/tiles/*`,
and the cached `city_icons`/`wvw` PNGs — is generated from the official
[GW2 API](https://wiki.guildwars2.com/wiki/API:Main) and
[wiki](https://wiki.guildwars2.com/wiki/Main_Page) by the scripts in this
directory.

Requires Node.js 20+ and npm. Run all commands from the repository root.

## Running the pipeline

Run the whole pipeline in dependency order with one command:

```sh
npm run seed                         # everything
npm run seed -- --only=poi,regions   # just selected domains
```

Each domain is also runnable on its own:

```sh
npm run cache-poi            # POI/label data from the GW2 API
npm run cache-regions        # region/map heading data from the GW2 API
npm run cache-extras         # adventures + city markers scraped from the GW2 wiki
npm run cache-event-timers   # meta-event schedule (event_timers.json)
npm run cache-city-icons     # local copies of wiki city icons (CORS workaround)
npm run cache-wvw-icons      # local copies of WvW objective markers
npm run build-tiles          # vector tiles (PMTiles) from all the JSON above
```

`seed-all.mjs` sequences the domains in dependency stages: JSON from the API and
wiki first, then the icons that JSON references, then the vector tiles built from
it. `--only=<domains>` runs a subset — valid domains are `poi`, `regions`,
`extras`, `event-timers`, `city-icons`, `wvw-icons`, `tiles`.

## Guarantees

The scripts are safe to re-run and ready to drop into CI:

- **Reliable** — network calls retry with backoff; a failed fetch exits non-zero
  (no more silently-swallowed errors).
- **Non-destructive** — output is written atomically and only after a validation
  gate passes, so a transient failure or a collapsed upstream response never
  overwrites good committed data.
- **Deterministic** — JSON is pretty-printed with stable key order, so a no-op
  re-run yields an empty `git diff` and real changes are easy to review.

Refreshed data is committed manually — review the diff, then commit.
`mists_objectives.json` is hand-maintained and is not produced by the pipeline
(it only reads it).

## Vector tiles (go-pmtiles)

`npm run build-tiles` converts the intermediate MBTiles to PMTiles with the
[go-pmtiles](https://github.com/protomaps/go-pmtiles) CLI. The binary is located
at build time from, in order: the `PMTILES_BIN` env var, `pmtiles` on `PATH`,
then `scripts/bin/pmtiles[.exe]`. Install a release binary, or:

```sh
go install github.com/protomaps/go-pmtiles/main@latest
```
