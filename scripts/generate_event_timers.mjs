// Rebuilds the meta-event schedule (src/assets/data/event_timers.json) from the
// wiki's event-timer widget data, switching from the old hand-curated flat
// per-boss list to the wiki's phase/duration model.
//
// The wiki source carries only names, chat links and phase durations — no
// coordinates/map/xpac. Those are derived here:
//   * timing  — walk the `partial` sequence once from 00:00 UTC then repeat
//               `pattern`; each segment's start = cumulative duration. Offsets
//               are minute-of-day; the app computes the next occurrence.
//   * coords  — a segment's chat link is a GW2 POI/waypoint link, so it joins
//               to that POI's `coord` from the API floors data. Failing that, a
//               segment named after a map, then the event's map centre. A phase
//               we still can't place is dropped with a warning.
//   * xpac    — wiki `category` mapped via CATEGORY_TO_XPAC (LW folds into the
//               adjacent expansion, festivals/non-located events excluded).
//
// A collapsed result fails the run via the shrink gate and leaves the committed
// file untouched (atomic write).
//   npm run cache-event-timers

import {pathToFileURL} from "node:url";
import {fetchJson} from "./lib/http.mjs";
import {writeJsonAtomic, readJsonIfExists} from "./lib/io.mjs";
import {assertEventTimers} from "./lib/validate.mjs";
import {log} from "./lib/log.mjs";
import {
  GW2_API,
  WIKI_EVENT_TIMER_URL,
  POI_FLOORS,
  CATEGORY_TO_XPAC,
  EVENT_EXCLUDE,
  EVENT_MAP_OVERRIDES,
  VALIDATION,
  dataFile,
} from "./config.mjs";

const DAY = 1440; // minutes
const EXPECTED_VERSION = "v5.2"; // pinned wiki schema version; drift only warns

const getContinent = (id, floor) => fetchJson(`${GW2_API}/continents/${id}/floors/${floor}`);

const rectCentre = (r) => [Math.round((r[0][0] + r[1][0]) / 2), Math.round((r[0][1] + r[1][1]) / 2)];
const roundPair = (c) => [Math.round(c[0]), Math.round(c[1])];

// Build the two lookups used to locate events: a chat-link -> {coord, map}
// index over every POI/waypoint, and a map-name -> centre index. Both come from
// the same floors traversal generate_pois/generate_regions use; Cantha (floor
// 1 of continent 2) is required or EoD/SotO/JW/VoE coords won't resolve.
async function buildLocationIndex() {
  const byChatLink = new Map();
  const mapCentres = new Map();

  for (const [continentId, floorIds] of Object.entries(POI_FLOORS)) {
    for (const floorId of floorIds) {
      const details = await getContinent(continentId, floorId);
      for (const region of Object.values(details.regions)) {
        for (const map of Object.values(region.maps)) {
          if (map.continent_rect && !mapCentres.has(map.name)) {
            mapCentres.set(map.name, rectCentre(map.continent_rect));
          }
          for (const poi of Object.values(map.points_of_interest ?? {})) {
            if (poi.chat_link && poi.coord && !byChatLink.has(poi.chat_link)) {
              byChatLink.set(poi.chat_link, {coord: roundPair(poi.coord), map: map.name});
            }
          }
        }
      }
    }
  }

  log.info(`indexed ${byChatLink.size} chat links, ${mapCentres.size} maps`);
  return {byChatLink, mapCentres};
}

// Walk the sequences to a per-segment set of minute-of-day START offsets, plus a
// per-segment duration and the cycle length. `partial` runs once from 00:00,
// then `pattern` repeats, filling a 24h day (a >24h `partial`, as Hard world
// bosses use, is truncated at midnight).
//
// A start is a phase *transition*: segment S starts at t only if a different
// segment was active just before t. This matters because `partial` exists to
// sync a phase already in progress at 00:00 — e.g. Verdant Brink's Night spans
// midnight, so it is active at 00:00 but did not *start* there. The wrap-around
// predecessor of the first interval is the last interval of the day.
function walkSequences(sequences) {
  const partial = sequences?.partial ?? [];
  const pattern = sequences?.pattern ?? [];
  const cycleMinutes = pattern.reduce((s, p) => s + p.d, 0) || DAY;

  // Contiguous intervals across [0, 1440): partial once, then pattern repeated.
  const intervals = [];
  let t = 0;
  const push = (step) => {
    intervals.push({id: String(step.r), start: t, d: step.d});
    t += step.d;
  };
  for (const step of partial) {
    if (t >= DAY) break;
    push(step);
  }
  if (pattern.length && pattern.some((p) => p.d > 0)) {
    while (t < DAY) {
      for (const step of pattern) {
        if (t >= DAY) break;
        push(step);
      }
    }
  }

  const offsets = new Map(); // segId -> Set<minute-of-day start>
  const durations = new Map(); // segId -> minutes
  for (let i = 0; i < intervals.length; i++) {
    const iv = intervals[i];
    durations.set(iv.id, iv.d);
    const prev = intervals[(i - 1 + intervals.length) % intervals.length];
    if (prev.id !== iv.id) {
      if (!offsets.has(iv.id)) offsets.set(iv.id, new Set());
      offsets.get(iv.id).add(iv.start % DAY);
    }
  }

  return {offsets, durations, cycleMinutes};
}

// Resolve one phase's coordinate + map: chat-link POI, else a map-named segment,
// else the event's map centre. Returns null if none apply.
function locatePhase(seg, eventMap, eventCentre, idx) {
  const {byChatLink, mapCentres} = idx;
  const chat = seg.chatlink ?? null;
  if (chat && byChatLink.has(chat)) {
    const hit = byChatLink.get(chat);
    return {coordinates: hit.coord, map: hit.map};
  }
  const name = (seg.name ?? "").trim();
  if (mapCentres.has(name)) {
    return {coordinates: mapCentres.get(name), map: name};
  }
  if (eventCentre) {
    return {coordinates: eventCentre, map: eventMap};
  }
  return null;
}

function buildEvents(data, idx) {
  const {mapCentres} = idx;
  const events = {};
  let dropped = 0;

  for (const [key, ev] of Object.entries(data.events ?? {})) {
    if (EVENT_EXCLUDE.has(key)) continue;

    const category = ev.category ?? "";
    if (!(category in CATEGORY_TO_XPAC)) {
      log.warn(`event ${key}: unmapped category "${category}" — skipping (add it to CATEGORY_TO_XPAC)`);
      continue;
    }
    const xpac = CATEGORY_TO_XPAC[category];
    if (xpac == null) continue; // known but intentionally not surfaced (festivals)

    // Event-level map + centre: an override, else the name matching a map.
    // Multi-map rotations (world bosses, Ley-Line) have no event map; their
    // phases locate per-segment via chat link / map-named segment.
    const mapName = EVENT_MAP_OVERRIDES[key] ?? (mapCentres.has(ev.name) ? ev.name : "");
    const eventCentre = mapName ? mapCentres.get(mapName) : null;

    const {offsets, durations, cycleMinutes} = walkSequences(ev.sequences);

    const phases = [];
    for (const [segId, seg] of Object.entries(ev.segments ?? {})) {
      const name = (seg.name ?? "").trim();
      if (!name) continue; // idle/spacer segment

      const segOffsets = [...(offsets.get(String(segId)) ?? [])].sort((a, b) => a - b);
      if (segOffsets.length === 0) continue; // never scheduled in a day

      const located = locatePhase(seg, mapName, eventCentre, idx);
      if (!located) {
        log.warn(`event ${key}: phase "${name}" has no resolvable location — dropping`);
        dropped++;
        continue;
      }

      phases.push({
        segmentId: String(segId),
        name,
        link: seg.link ?? null,
        chatLink: seg.chatlink ?? null,
        map: located.map,
        coordinates: located.coordinates,
        durationMinutes: durations.get(String(segId)) ?? 0,
        offsets: segOffsets,
      });
    }

    if (phases.length === 0) {
      log.warn(`event ${key} (${ev.name}): no displayable phases — skipping`);
      continue;
    }

    events[key] = {
      key,
      name: ev.name,
      category,
      xpac,
      map: mapName,
      coordinates: eventCentre ?? phases[0].coordinates,
      cycleMinutes,
      phases,
    };
  }

  return {events, dropped};
}

export async function main() {
  const data = await fetchJson(WIKI_EVENT_TIMER_URL);
  const version = data?.config?.version ?? "(none)";
  if (version !== EXPECTED_VERSION) {
    log.warn(`wiki event-timer schema is ${version}, expected ${EXPECTED_VERSION} — review the parser if output looks off`);
  }

  const idx = await buildLocationIndex();
  const {events, dropped} = buildEvents(data, idx);

  const out = {version, events};
  const eventCount = Object.keys(events).length;
  const phaseCount = Object.values(events).reduce((n, e) => n + e.phases.length, 0);

  const file = dataFile("event_timers.json");
  writeJsonAtomic(file, out, {
    validate: (d) => assertEventTimers(d, readJsonIfExists(file), VALIDATION.event_timers),
  });
  log.info(`wrote ${eventCount} events / ${phaseCount} phases (${dropped} phases dropped) -> ${file}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    log.error(err);
    process.exit(1);
  });
}
