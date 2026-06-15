import {map, Observable, of} from "rxjs";
import OlMap from "ol/Map";
import BaseLayer from "ol/layer/Base";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";

import {
  buildAdventurePinFeatures, buildCityPinFeatures, buildPoiPinFeatures, PIN_SOURCE, TYRIA_MARKER_SUBLAYERS,
} from "./tyria-layers";

/**
 * Manages the non-tiled, full-feature overlays for *pinned* Tyria marker kinds.
 * The vector tiles carry no geometry below a kind's display zoom, so pinning a
 * kind loads its complete set (lazily, parsed once per kind and cached) and
 * draws it with no zoom constraint; the merged tiled layer skips pinned kinds
 * (see `sublayerVisible`) so they never double up.
 *
 * Framework-light: it takes the OL map, the host's interactive-layer set, a
 * JSON fetcher (so it doesn't depend on Angular's HttpClient) and a predicate
 * for "is this kind still pinned?" (the load is async and the user may have
 * toggled the kind off again before it resolves).
 */
export class PinOverlays {
  private readonly overlays = new Map<string, VectorLayer>();
  private readonly featureCache = new Map<string, Feature<Point>[]>();
  private destroyed = false;

  constructor(
    private readonly map: OlMap,
    private readonly interactiveLayers: Set<BaseLayer>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw JSON at the parse boundary, validated by the build* helpers.
    private readonly fetchJson: (url: string) => Observable<any[]>,
    private readonly isPinned: (id: string) => boolean,
  ) {}

  /** Adds the overlay for `id` when pinned, removes it otherwise. */
  sync(id: string, pinned: boolean): void {
    if (!pinned) {
      this.remove(id);
      return;
    }
    if (this.overlays.has(id)) {
      return;
    }
    const sub = TYRIA_MARKER_SUBLAYERS.find(s => s.id === id);
    if (!sub) {
      return;
    }
    this.load(id).subscribe(features => {
      // The async load can resolve after the user toggled the kind off again
      // (or pinned it twice), or after the map was destroyed.
      if (this.destroyed || !this.isPinned(id) || this.overlays.has(id)) {
        return;
      }
      const layer = new VectorLayer({
        source: new VectorSource({features}),
        style: feature => sub.style(feature),
        zIndex: 2,
        updateWhileAnimating: true,
        updateWhileInteracting: true,
      });
      this.overlays.set(id, layer);
      this.interactiveLayers.add(layer);
      this.map.addLayer(layer);
    });
  }

  private remove(id: string): void {
    const layer = this.overlays.get(id);
    if (layer) {
      this.map.removeLayer(layer);
      this.interactiveLayers.delete(layer);
      this.overlays.delete(id);
    }
  }

  /** Full feature set for a pinnable kind, parsed once from its data JSON. */
  private load(id: string): Observable<Feature<Point>[]> {
    const cached = this.featureCache.get(id);
    if (cached) {
      return of(cached);
    }
    switch (PIN_SOURCE[id]) {
      case "poi":
        return this.fetchJson("assets/data/poi_labels_1_1.json").pipe(
          // One fetch covers all seven poi_labels-derived kinds; cache each.
          map(raw => {
            for (const [kind, features] of buildPoiPinFeatures(raw)) {
              this.featureCache.set(kind, features);
            }
            return this.featureCache.get(id) ?? [];
          }),
        );
      case "adventure":
        return this.fetchJson("assets/data/adventure_labels.json").pipe(
          map(raw => {
            const features = buildAdventurePinFeatures(raw);
            this.featureCache.set(id, features);
            return features;
          }),
        );
      case "city":
        return this.fetchJson("assets/data/city_markers.json").pipe(
          map(raw => {
            const features = buildCityPinFeatures(raw);
            this.featureCache.set(id, features);
            return features;
          }),
        );
      default:
        return of([]);
    }
  }

  destroy(): void {
    this.destroyed = true;
    for (const layer of this.overlays.values()) {
      this.map.removeLayer(layer);
    }
    this.overlays.clear();
  }
}
