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

// Read coordinates straight from each page's {{Adventure infobox}} wikitext: the
// wiki stopped annotating adventure coordinates as SMW properties (2026-08), so
// the old `action=ask` query on "Has x coordinate" returns nothing.
const ADVENTURES_QUERY_URL =
  `${WIKI_API}?action=query&format=json&generator=categorymembers&gcmtitle=Category:Adventures` +
  `&gcmlimit=50&prop=revisions|info&rvprop=content&inprop=url`;

const wikiTextQueryUrl = (pageTitle) =>
  `${WIKI_API}?action=query&format=json&prop=revisions&rvprop=content&titles=${pageTitle}`;

// --- adventures -------------------------------------------------------------

// [[Target|label]] -> label, [[Target]] -> Target, <br> -> newline.
const stripWikiMarkup = (s) =>
  s
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .trim();

async function generateAdventures() {
  const pages = [];
  let cont = "";
  do {
    const body = await fetchJson(ADVENTURES_QUERY_URL + cont);
    pages.push(...Object.values(body.query.pages));
    cont = body.continue ? `&gcmcontinue=${encodeURIComponent(body.continue.gcmcontinue)}` : "";
  } while (cont);

  const adventures = pages
    .map((page) => {
      const text = page.revisions[0]["*"];
      // Seen on the wiki: `[x,y]`, `[x,y,floor]` and bare `x, y`.
      const coords = text.match(/\|\s*coordinates\s*=\s*\[?\s*([\d.]+)\s*,\s*([\d.]+)/);
      // Value runs (possibly over several lines) up to the next param / template end.
      const description = text.match(/\|\s*description\s*=[ \t]*(\S[^]*?)\n\s*(?:\||\}\})/);
      // Drop category pages that aren't a placed adventure (NPCs, the overview page).
      if (!coords || !description) return null;
      return {
        id: page.title,
        coordinates: [Number(coords[1]), Number(coords[2])],
        type: "Adventure",
        data: {
          tooltip: stripWikiMarkup(description[1]),
          url: page.fullurl.replace(/^https?:/, ""),
        },
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));

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

// Each line is one marker object, optionally with a trailing comma. Skip blank
// lines and HTML comments (wiki drift). Strip trailing comma only when present.
function parseMarkers(markerDataStr) {
  return markerDataStr
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("<!--"))
    .map((s) => (s.endsWith(",") ? s.slice(0, -1) : s))
    .map((s) => JSON.parse(s));
}

async function getWikiImageUrl(filename) {
  const url = `${WIKI_API}?action=query&format=json&prop=imageinfo&iiprop=url&titles=${encodeURIComponent(`File:${filename}`)}`;
  const body = await fetchJson(url, {delayMs: 50});
  const pages = body.query.pages;
  const pageId = Object.keys(pages)[0];
  return pages[pageId].imageinfo?.[0]?.url ?? null;
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
          if (icon === null) {
            log.warn(`skipping marker "${marker.name}" (${pageTitle}): icon not found on wiki: ${marker.icon}`);
            continue;
          }
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
