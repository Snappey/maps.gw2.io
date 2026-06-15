import {Injectable} from "@angular/core";
import {firstValueFrom, take} from "rxjs";
import {ToastrService} from "ngx-toastr";

import {MapService} from "./map.service";
import {UserLayerService} from "./user-layer.service";
import {MapRectInfo} from "../lib/taco/taco-convert";
import {ParsedTaco, parseTacoXml, parseTrl} from "../lib/taco/taco-parse";
import {buildTacoLayers} from "../lib/taco/taco-import";
import {TOAST_TOP_RIGHT as TOAST_OPTS} from "../lib/toast-options";

const TITLE = "TacO import";

/** Lower-cased filename without its directory (TacO refs are by basename). */
function basename(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop()!.toLowerCase();
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

/** Files collected from the drop (a `.taco`/`.zip` expands into these). */
interface DropAssets {
  xmlTexts: string[];
  /** basename -> `.trl` bytes (every source). Referenced by xml `<Trail>` or, if
   *  unreferenced, rendered as a standalone self-contained trail. */
  trlBuffers: Map<string, ArrayBuffer>;
  /** basename -> icon blob, for `resolveIcon`. */
  icons: Map<string, Blob>;
}

/**
 * Parses dropped TacO files (`.xml`, `.trl`, or `.taco`/`.zip` bundles) and adds
 * the result as temporary (ephemeral) user layers. Object URLs minted for pack
 * icons are revoked once all layers from their import are removed.
 */
@Injectable({providedIn: "root"})
export class TacoImportService {
  private importGroups: {ids: Set<string>; urls: string[]}[] = [];

  constructor(
    private maps: MapService,
    private userLayers: UserLayerService,
    private toastr: ToastrService,
  ) {
    this.userLayers.layers$.subscribe(layers => {
      const present = new Set(layers.map(l => l.id));
      this.importGroups = this.importGroups.filter(group => {
        if ([...group.ids].some(id => present.has(id))) {
          return true;
        }
        group.urls.forEach(url => URL.revokeObjectURL(url));
        return false;
      });
    });
  }

  async importFiles(files: File[], mountedContinentId: 1 | 2): Promise<void> {
    let mapList;
    try {
      mapList = await firstValueFrom(this.maps.getAllMaps().pipe(take(1)));
    } catch {
      this.toastr.error("Couldn't load GW2 map data — try again.", TITLE, TOAST_OPTS);
      return;
    }
    const lookup = new Map<number, MapRectInfo>(
      mapList.map((m): [number, MapRectInfo] =>
        [m.id, {continent_id: m.continent_id, map_rect: m.map_rect, continent_rect: m.continent_rect}]),
    );

    let assets: DropAssets;
    try {
      assets = await this.readFiles(files);
    } catch (e) {
      this.toastr.error(e instanceof Error ? e.message : String(e), TITLE, TOAST_OPTS);
      return;
    }

    const parsed: ParsedTaco = {pois: [], trails: [], categories: new Map()};
    const consumedTrls = new Set<string>();
    let skippedTrailsNoData = 0;

    for (const xml of assets.xmlTexts) {
      let one: ParsedTaco;
      try {
        one = parseTacoXml(xml);
      } catch (e) {
        this.toastr.warning(e instanceof Error ? e.message : String(e), TITLE, TOAST_OPTS);
        continue;
      }
      parsed.pois.push(...one.pois);
      one.categories.forEach((v, k) => parsed.categories.set(k, v));
      for (const trail of one.trails) {
        const ref = trail.trailData ? basename(trail.trailData) : undefined;
        const buf = ref ? assets.trlBuffers.get(ref) : undefined;
        if (!ref || !buf) {
          skippedTrailsNoData++;
          continue;
        }
        consumedTrls.add(ref);
        try {
          const binary = parseTrl(buf);
          parsed.trails.push({...trail, mapId: binary.mapId, points: binary.points});
        } catch {
          skippedTrailsNoData++;
        }
      }
    }
    // .trl files not referenced by any xml are self-contained standalone trails.
    for (const [name, buf] of assets.trlBuffers) {
      if (consumedTrls.has(name)) {
        continue;
      }
      try {
        parsed.trails.push(parseTrl(buf));
      } catch {
        skippedTrailsNoData++;
      }
    }

    if (!parsed.pois.length && !parsed.trails.length) {
      this.toastr.warning("No placeable markers found in the dropped file(s).", TITLE, TOAST_OPTS);
      return;
    }

    // Mint one object URL per distinct icon, tracked for revoke-on-remove.
    const urlCache = new Map<string, string>();
    const createdUrls: string[] = [];
    const resolveIcon = (iconPath?: string): string | undefined => {
      if (!iconPath) {
        return undefined;
      }
      const key = basename(iconPath);
      const blob = assets.icons.get(key);
      if (!blob) {
        return undefined;
      }
      let url = urlCache.get(key);
      if (!url) {
        url = URL.createObjectURL(blob);
        urlCache.set(key, url);
        createdUrls.push(url);
      }
      return url;
    };

    const sourceName = files.map(f => f.name).join(", ");
    const result = buildTacoLayers(parsed, lookup, {sourceName, resolveIcon});
    result.skippedTrailsNoData += skippedTrailsNoData;

    if (!result.layers.length) {
      createdUrls.forEach(url => URL.revokeObjectURL(url));
      this.toastr.warning("Markers found, but none are on a known map.", TITLE, TOAST_OPTS);
      return;
    }

    if (createdUrls.length) {
      this.importGroups.push({ids: new Set(result.layers.map(l => l.id)), urls: createdUrls});
    }
    this.userLayers.addLayers(result.layers);
    this.report(result, mountedContinentId);
  }

  /** Reads/expands dropped files into a flat asset bag. */
  private async readFiles(files: File[]): Promise<DropAssets> {
    const assets: DropAssets = {xmlTexts: [], trlBuffers: new Map(), icons: new Map()};
    for (const file of files) {
      const ext = extOf(file.name);
      if (ext === "xml") {
        assets.xmlTexts.push(await file.text());
      } else if (ext === "trl") {
        assets.trlBuffers.set(basename(file.name), await file.arrayBuffer());
      } else if (ext === "taco" || ext === "zip") {
        await this.readZip(await file.arrayBuffer(), assets);
      }
      // other extensions are ignored
    }
    return assets;
  }

  private async readZip(buffer: ArrayBuffer, assets: DropAssets): Promise<void> {
    // Loaded on demand so jszip (~95 kB) ships in its own chunk, fetched only
    // when a user actually drops a .taco/.zip pack rather than on map load.
    const {default: JSZip} = await import("jszip");
    const zip = await JSZip.loadAsync(buffer);
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) {
        continue;
      }
      const ext = extOf(entry.name);
      const key = basename(entry.name);
      if (ext === "xml") {
        assets.xmlTexts.push(await entry.async("text"));
      } else if (ext === "trl") {
        assets.trlBuffers.set(key, await entry.async("arraybuffer"));
      } else if (ext === "png" || ext === "jpg" || ext === "jpeg") {
        assets.icons.set(key, await entry.async("blob"));
      }
    }
  }

  private report(
    result: {poiCount: number; trailCount: number; skippedUnknownMap: number; skippedTrailsNoData: number; layers: {continentId: 1 | 2}[]},
    mountedContinentId: 1 | 2,
  ): void {
    const parts: string[] = [];
    if (result.poiCount) {
      parts.push(`${result.poiCount} marker${result.poiCount === 1 ? "" : "s"}`);
    }
    if (result.trailCount) {
      parts.push(`${result.trailCount} trail${result.trailCount === 1 ? "" : "s"}`);
    }
    this.toastr.info(`Imported ${parts.join(", ")}.`, TITLE, TOAST_OPTS);

    const skipped: string[] = [];
    if (result.skippedUnknownMap) {
      skipped.push(`${result.skippedUnknownMap} on unknown maps`);
    }
    if (result.skippedTrailsNoData) {
      skipped.push(`${result.skippedTrailsNoData} trails without trail data`);
    }
    if (skipped.length) {
      this.toastr.warning(`Skipped ${skipped.join(", ")}.`, TITLE, TOAST_OPTS);
    }

    const other = mountedContinentId === 1 ? 2 : 1;
    if (result.layers.some(l => l.continentId === other)) {
      const label = other === 2 ? "the Mists (/wvw)" : "Tyria (/tyria)";
      this.toastr.info(`Some markers are on ${label} — switch maps to see them.`, TITLE, TOAST_OPTS);
    }
  }
}
