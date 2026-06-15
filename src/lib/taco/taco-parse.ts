/**
 * Parsers for GW2 TacO / BlishHUD marker files.
 *
 * A `.xml` pack describes a nested tree of `<MarkerCategory>` plus flat `<POI>`
 * and `<Trail>` placements. A `.trl` is a tiny binary trail: an 8-byte header
 * (version + mapID) followed by float32 vertex triples. Both store positions in
 * GW2 *world* coordinates (inches); src/lib/taco/taco-convert.ts turns those
 * into continent pixels.
 *
 * These are pure functions — the only platform deps are the browser's
 * `DOMParser` and `DataView` — so they unit-test cleanly.
 */

export interface TacoPoi {
  mapId: number;
  /** World coords in inches. y is height (ignored for 2D placement). */
  x: number;
  y: number;
  z: number;
  /** Dotted, lower-cased category path (e.g. "parent.child"). */
  type?: string;
  name?: string;
  iconFile?: string;
}

export interface TacoTrail {
  mapId: number;
  points: {x: number; y: number; z: number}[];
  type?: string;
  name?: string;
  color?: string;
  /** Relative path to the `.trl` binary inside the pack (xml `<Trail>` only). */
  trailData?: string;
}

export interface TacoCategory {
  displayName?: string;
  iconFile?: string;
  color?: string;
}

export interface ParsedTaco {
  pois: TacoPoi[];
  trails: TacoTrail[];
  /** Keyed by full dotted, lower-cased type-path. */
  categories: Map<string, TacoCategory>;
}

/** Case-insensitive attribute read — TacO packs are inconsistent about casing. */
function attr(el: Element, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const a of Array.from(el.attributes)) {
    if (a.name.toLowerCase() === lower) {
      return a.value;
    }
  }
  return undefined;
}

function num(el: Element, name: string): number | undefined {
  const raw = attr(el, name);
  if (raw === undefined) {
    return undefined;
  }
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Every descendant element whose tag matches `tag` (case-insensitive). */
function elementsByTag(root: Document, tag: string): Element[] {
  const lower = tag.toLowerCase();
  return Array.from(root.getElementsByTagName("*")).filter(el => el.tagName.toLowerCase() === lower);
}

/** Recursively flattens the `<MarkerCategory>` tree into dotted lower-case paths. */
function walkCategories(parent: Element, prefix: string, out: Map<string, TacoCategory>) {
  for (const el of Array.from(parent.children)) {
    if (el.tagName.toLowerCase() !== "markercategory") {
      continue;
    }
    const name = (attr(el, "name") ?? "").toLowerCase();
    const path = prefix ? `${prefix}.${name}` : name;
    out.set(path, {
      displayName: attr(el, "DisplayName"),
      iconFile: attr(el, "iconFile"),
      color: attr(el, "color"),
    });
    walkCategories(el, path, out);
  }
}

/**
 * Parses a TacO `.xml` overlay file. Throws on malformed XML. POIs missing a
 * finite MapID/xpos/zpos are skipped. `<Trail>` elements come back with their
 * `trailData` reference but empty points — the caller resolves the referenced
 * `.trl` and fills them in.
 */
export function parseTacoXml(xmlText: string): ParsedTaco {
  // TacO packs frequently contain unescaped ampersands (e.g. in a DisplayName
  // like "Mussels & Plants"); strict XML rejects those, so repair any '&' that
  // doesn't already start a valid entity before parsing.
  const repaired = xmlText.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;");
  const doc = new DOMParser().parseFromString(repaired, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("File is not valid XML");
  }

  const categories = new Map<string, TacoCategory>();
  if (doc.documentElement) {
    walkCategories(doc.documentElement, "", categories);
  }

  const pois: TacoPoi[] = [];
  for (const el of elementsByTag(doc, "POI")) {
    const mapId = num(el, "MapID");
    const x = num(el, "xpos");
    const z = num(el, "zpos");
    if (mapId === undefined || x === undefined || z === undefined) {
      continue;
    }
    pois.push({
      mapId,
      x,
      y: num(el, "ypos") ?? 0,
      z,
      type: attr(el, "type")?.toLowerCase(),
      name: attr(el, "name"),
      iconFile: attr(el, "iconFile"),
    });
  }

  const trails: TacoTrail[] = [];
  for (const el of elementsByTag(doc, "Trail")) {
    trails.push({
      mapId: -1,
      points: [],
      type: attr(el, "type")?.toLowerCase(),
      name: attr(el, "name"),
      color: attr(el, "color"),
      trailData: attr(el, "trailData"),
    });
  }

  return {pois, trails, categories};
}

/**
 * Parses a `.trl` binary trail. Little-endian: uint32 version, int32 mapID,
 * then float32 (x, y, z) per vertex. A (0,0,0) vertex is a "pen up" break and
 * is returned as-is for the caller to split on. Throws on a malformed length.
 */
export function parseTrl(buffer: ArrayBuffer): TacoTrail {
  if (buffer.byteLength < 8 || (buffer.byteLength - 8) % 12 !== 0) {
    throw new Error("Malformed .trl file (unexpected length)");
  }
  const view = new DataView(buffer);
  const mapId = view.getInt32(4, true);
  const count = (buffer.byteLength - 8) / 12;
  const points: {x: number; y: number; z: number}[] = [];
  for (let i = 0; i < count; i++) {
    const o = 8 + i * 12;
    points.push({
      x: view.getFloat32(o, true),
      y: view.getFloat32(o + 4, true),
      z: view.getFloat32(o + 8, true),
    });
  }
  return {mapId, points};
}
