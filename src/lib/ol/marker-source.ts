import {Feature} from "ol";
import Point from "ol/geom/Point";
import Polygon from "ol/geom/Polygon";
import {Gw2MapConfig, gw2ToOl} from "./gw2-projection";

/**
 * One marker feature as emitted by scripts/generate-marker-features.mjs.
 * Coordinates are GW2 continent pixels (Y-down); `layer` is the discriminator
 * the OL styles, tooltip/wiki/chat-link helpers and hit-testing all branch on
 * (it mirrors the MVT source-layer name the old PMTiles path put in `layer`).
 */
export interface MarkerFeatureJson {
  layer: string;
  geometry:
    | {type: "Point"; coordinates: [number, number]}
    | {type: "Polygon"; coordinates: [number, number][][]};
  [prop: string]: unknown;
}

/** URL of the consolidated marker file for a continent (mirrors chatLinkIndexUrl). */
export const markerFeaturesUrl = (config: Gw2MapConfig): string => {
  const prefix = config.continentId === 1 ? "tyria" : "mists";
  return `assets/data/markers_${prefix}_${config.continentId}_${config.floorId}.json`;
};

/**
 * Builds OL features from the consolidated marker JSON: GW2 px is converted to OL
 * coordinates via gw2ToOl (never inline the sign flip) and every property —
 * including `layer` — is copied onto the feature, so the existing styles and
 * hit-testing work unchanged. Mirrors buildUserLayerSource's feature build.
 */
export function buildMarkerFeatures(raw: MarkerFeatureJson[]): Feature[] {
  const features: Feature[] = [];
  for (const {geometry, ...props} of raw) {
    const olGeometry = geometry.type === "Point"
      ? new Point(gw2ToOl(geometry.coordinates))
      : new Polygon(geometry.coordinates.map(ring => ring.map(c => gw2ToOl(c))));
    const feature = new Feature({geometry: olGeometry});
    feature.setProperties(props);
    features.push(feature);
  }
  return features;
}
