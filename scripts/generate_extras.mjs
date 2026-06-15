// Scrapes "extra" overlay data from the GW2 wiki: adventure locations (via the
// Semantic MediaWiki ask API) and city NPC/merchant markers (parsed out of the
// {{interactive map}} templates on a fixed set of city pages). Both writes are
// atomic + shrink-gated, and city scraping is fail-closed: if any page errors
// (the wiki format is brittle) the run fails instead of silently committing a
// partial file the way the old script did.
//   npm run cache-extras

import {pathToFileURL} from "node:url";
import {fetchJson} from "./lib/http.mjs";
import {writeJsonAtomic, readJsonIfExists} from "./lib/io.mjs";
import {assertNotShrunk} from "./lib/validate.mjs";
import {log} from "./lib/log.mjs";
import {WIKI_API, CITY_PAGES, VALIDATION, dataFile} from "./config.mjs";

const ADVENTURES_QUERY_URL =
  `${WIKI_API}?action=ask&format=json&query=[[Category:Adventures]]|[[Has%20x%20coordinate::%3E0]]` +
  `|?Has%20x%20coordinate|?Has%20y%20coordinate|?Has game description|limit=500`;

const wikiTextQueryUrl = (pageTitle) =>
  `${WIKI_API}?action=query&format=json&prop=revisions&rvprop=content&titles=${pageTitle}`;

// --- adventures -------------------------------------------------------------

async function generateAdventures() {
  const body = await fetchJson(ADVENTURES_QUERY_URL);
  const adventures = Object.entries(body.query.results)
    // Drop NPCs linked to adventures that have no game description.
    .filter(([, data]) => data.printouts["Has game description"][0] !== undefined)
    .map(([name, data]) => ({
      id: name,
      coordinates: [data.printouts["Has x coordinate"][0], data.printouts["Has y coordinate"][0]],
      type: "Adventure",
      data: {
        tooltip: data.printouts["Has game description"][0],
        url: data.fullurl,
      },
    }));

  const out = dataFile("adventure_labels.json");
  writeJsonAtomic(out, adventures, {
    validate: (d) => assertNotShrunk(d, readJsonIfExists(out), VALIDATION.adventures),
  });
  log.info(`wrote ${adventures.length} adventures -> ${out}`);
}

// --- city markers -----------------------------------------------------------

function extractMarkers(text) {
  const startMarker = "{{interactive map";
  const paramMarker = "markers";
  const endMarker = "}}";

  const start = text.toLowerCase().indexOf(startMarker);
  if (start === -1) return null;

  let paramStart = text.indexOf(paramMarker, start);
  if (paramStart === -1) return null;

  paramStart += paramMarker.length;
  const startOfData = text.indexOf("{", paramStart);
  const end = text.indexOf(endMarker, paramStart);
  if (end === -1) return null;

  return text.slice(startOfData, end).trim();
}

// Each line is one marker object with a trailing comma; strip the comma and
// parse it. A malformed line throws, failing the whole page (and, fail-closed,
// the run). Note: unconditionally drops the last char of every line.
function parseMarkers(markerDataStr) {
  return markerDataStr
    .split("\n")
    .map((s) => s.substring(0, s.length - 1))
    .map((s) => JSON.parse(s));
}

async function getWikiImageUrl(filename) {
  const url = `${WIKI_API}?action=query&format=json&prop=imageinfo&iiprop=url&titles=${encodeURIComponent(`File:${filename}`)}`;
  const body = await fetchJson(url, {delayMs: 50});
  const pages = body.query.pages;
  const pageId = Object.keys(pages)[0];
  return pages[pageId].imageinfo[0].url;
}

async function generateCityMarkers() {
  const failedPages = [];
  let markers = [];

  for (const pageTitle of CITY_PAGES) {
    try {
      const body = await fetchJson(wikiTextQueryUrl(pageTitle));
      const pageTexts = Object.values(body.query.pages).map((p) => p.revisions[0]["*"]);
      const markerStrs = pageTexts.map(extractMarkers).filter(Boolean);

      const pageMarkers = [];
      for (const markerStr of markerStrs) {
        for (const marker of parseMarkers(markerStr)) {
          const icon = await getWikiImageUrl(marker.icon);
          pageMarkers.push({...marker, icon});
        }
      }
      markers = [...markers, ...pageMarkers];
      log.info(`parsed ${pageMarkers.length} markers from ${pageTitle}`);
    } catch (err) {
      failedPages.push(pageTitle);
      log.error(`failed to parse city page "${pageTitle}":`, err);
    }
  }

  // Fail-closed: a broken wiki page must not silently shrink the committed file.
  if (failedPages.length) {
    throw new Error(`city markers: ${failedPages.length} page(s) failed: ${failedPages.join(", ")}`);
  }

  const out = dataFile("city_markers.json");
  writeJsonAtomic(out, markers, {
    validate: (d) => assertNotShrunk(d, readJsonIfExists(out), VALIDATION.city_markers),
  });
  log.info(`wrote ${markers.length} city markers -> ${out}`);
}

// --- main -------------------------------------------------------------------

export async function main() {
  const tasks = [
    ["adventures", generateAdventures],
    ["city markers", generateCityMarkers],
  ];

  const failures = [];
  for (const [name, fn] of tasks) {
    try {
      await fn();
    } catch (err) {
      failures.push(name);
      log.error(`${name} failed:`, err);
    }
  }
  if (failures.length) {
    throw new Error(`extras generation failed: ${failures.join(", ")}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    log.error(err);
    process.exit(1);
  });
}
