import {Injectable} from "@angular/core";
import {BehaviorSubject, map, Observable} from "rxjs";

/** GeoJSON geometry subset supported for user layers; coordinates in GW2 continent px. */
export type UserGeometry =
  | {type: "Point"; coordinates: [number, number]}
  | {type: "LineString"; coordinates: [number, number][]}
  | {type: "Polygon"; coordinates: [number, number][][]};

export interface UserFeature {
  geometry: UserGeometry;
  name?: string;
  description?: string;
  icon?: string;
}

export interface UserLayer {
  id: string;
  name: string;
  continentId: 1 | 2;
  color: string;
  features: UserFeature[];
}

const STORAGE_KEY = "gw2io.userLayers";
const SUPPORTED_GEOMETRIES = ["Point", "LineString", "Polygon"];

/**
 * User-made map layers: imported as GeoJSON in GW2 continent pixel
 * coordinates, persisted to localStorage, rendered by the OL maps as plain
 * vector layers (see src/lib/ol/user-layers.ts).
 */
@Injectable({providedIn: "root"})
export class UserLayerService {
  private layersSubject = new BehaviorSubject<UserLayer[]>(this.load());
  layers$ = this.layersSubject.asObservable();

  layersFor(continentId: number): Observable<UserLayer[]> {
    return this.layers$.pipe(map(layers => layers.filter(l => l.continentId === continentId)));
  }

  /** Parses a GeoJSON FeatureCollection; throws with a user-readable message. */
  importGeoJson(name: string, continentId: 1 | 2, color: string, geoJsonText: string): UserLayer {
    if (!name.trim()) {
      throw new Error("Layer name is required");
    }

    let parsed: {type?: string, features?: unknown[]};
    try {
      parsed = JSON.parse(geoJsonText);
    } catch {
      throw new Error("Not valid JSON");
    }
    if (parsed?.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
      throw new Error("Expected a GeoJSON FeatureCollection");
    }

    const features: UserFeature[] = parsed.features.map((raw, i) => {
      const f = raw as {geometry?: UserGeometry, properties?: {[k: string]: unknown}};
      if (!f.geometry || !SUPPORTED_GEOMETRIES.includes(f.geometry.type)) {
        throw new Error(`Feature ${i}: unsupported geometry (use Point/LineString/Polygon)`);
      }
      const props = f.properties ?? {};
      return {
        geometry: f.geometry,
        name: typeof props["name"] === "string" ? props["name"] : undefined,
        description: typeof props["description"] === "string" ? props["description"] : undefined,
        icon: typeof props["icon"] === "string" ? props["icon"] : undefined,
      };
    });

    const layer: UserLayer = {
      id: `user_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      continentId,
      color,
      features,
    };

    this.persist([...this.layersSubject.value, layer]);
    return layer;
  }

  exportGeoJson(id: string): string | undefined {
    const layer = this.layersSubject.value.find(l => l.id === id);
    if (!layer) {
      return undefined;
    }
    return JSON.stringify({
      type: "FeatureCollection",
      features: layer.features.map(f => ({
        type: "Feature",
        geometry: f.geometry,
        properties: {
          ...(f.name ? {name: f.name} : {}),
          ...(f.description ? {description: f.description} : {}),
          ...(f.icon ? {icon: f.icon} : {}),
        },
      })),
    }, undefined, 2);
  }

  remove(id: string) {
    this.persist(this.layersSubject.value.filter(l => l.id !== id));
  }

  private persist(layers: UserLayer[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layers));
    this.layersSubject.next(layers);
  }

  private load(): UserLayer[] {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    } catch {
      return [];
    }
  }
}
