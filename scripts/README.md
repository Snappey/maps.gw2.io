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
npm run build-marker-features # consolidated marker feature files + chat-link index
```

`seed-all.mjs` sequences the domains in dependency stages: JSON from the API and
wiki first, then the icons that JSON references, then the consolidated marker
feature files built from it. `--only=<domains>` runs a subset — valid domains are
`poi`, `regions`, `extras`, `event-timers`, `city-icons`, `wvw-icons`, `markers`.

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

## Marker features

`npm run build-marker-features` collects every static map marker (waypoints,
POIs, vistas, hearts, hero points, masteries, adventures, cities, sector
outlines/labels, heart bounds) into one flat JSON file per continent that the
OpenLayers vector layers load directly:

- `src/assets/data/markers_tyria_1_1.json`
- `src/assets/data/markers_mists_2_1.json`

Each feature is `{layer, geometry, ...props}` in GW2 continent pixels, where
`layer` is the source-layer name the map's styles and hit-testing branch on. The
same pass also emits the chat-link deep-link index (`src/assets/tiles/*.index.json`),
which maps a normalized chat link to its coordinate for `/tyria/:chatLink` links.
