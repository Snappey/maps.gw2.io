import {Feature} from "ol";
import {FeatureLike} from "ol/Feature";
import LineString from "ol/geom/LineString";
import Point from "ol/geom/Point";
import Polygon from "ol/geom/Polygon";
import VectorSource from "ol/source/Vector";
import {asArray} from "ol/color";
import CircleStyle from "ol/style/Circle";
import {Fill, Stroke, Style} from "ol/style";
import {StyleLike} from "ol/style/Style";
import {UserLayer} from "../../services/user-layer.service";
import {gw2ToOl} from "./gw2-projection";
import {iconStyle} from "./marker-styles";

export const USER_LAYER_ID_PREFIX = "user_";

/**
 * Credit for the bundled Lady Elyssa marker pack, set on each TacO source so the
 * OpenLayers attribution control shows it whenever one of those layers is enabled
 * (mirrors the About-modal credit; OL dedupes the identical string to one entry).
 */
export const TACO_PACK_ATTRIBUTION =
  '<a href="https://github.com/LadyElyssa/LadyElyssaTacoTrails" target="_blank">Lady Elyssa\'s Markers</a>';

/** Builds a VectorSource from a user layer's normalized features. */
export function buildUserLayerSource(layer: UserLayer): VectorSource {
  const source = new VectorSource();

  for (const userFeature of layer.features) {
    const geometry = toOlGeometry(userFeature.geometry);
    if (!geometry) {
      continue;
    }
    const feature = new Feature({geometry});
    feature.setProperties({
      layer: "user",
      tooltip: userFeature.description ?
        `${userFeature.name ?? layer.name}: ${userFeature.description}` :
        (userFeature.name ?? layer.name),
      icon: userFeature.icon,
    });
    source.addFeature(feature);
  }

  return source;
}

function toOlGeometry(geometry: UserLayer["features"][number]["geometry"]) {
  switch (geometry.type) {
    case "Point":
      return new Point(gw2ToOl(geometry.coordinates));
    case "LineString":
      return new LineString(geometry.coordinates.map(c => gw2ToOl(c)));
    case "Polygon":
      return new Polygon(geometry.coordinates.map(ring => ring.map(c => gw2ToOl(c))));
    default:
      return undefined;
  }
}

// Keep marker icons above paths. Within a layer, points draw above lines/polygons
// (style zIndex); across layers, any layer that contains a path renders a band
// below point-only layers (userLayerZIndex), so no path ever sits in the icon band.
const POINT_STYLE_Z = 1;
const SHAPE_STYLE_Z = 0;
const ICON_LAYER_Z = 5;
const PATH_LAYER_Z = 4;

/** Points render as the feature's icon or a coloured dot; lines/polygons in the layer colour. */
export function userLayerStyle(color: string): StyleLike {
  const [r, g, b] = asArray(color);
  const stroke = new Stroke({color, width: 3});
  const fill = new Fill({color: [r, g, b, 0.15]});
  const dot = new Style({
    image: new CircleStyle({
      radius: 7,
      fill: new Fill({color}),
      stroke: new Stroke({color: "rgba(0, 0, 0, 0.8)", width: 2}),
    }),
    zIndex: POINT_STYLE_Z,
  });
  const shape = new Style({stroke, fill, zIndex: SHAPE_STYLE_Z});

  return (feature: FeatureLike) => {
    if (feature.getGeometry()?.getType() === "Point") {
      const icon = feature.get("icon");
      return icon ? iconStyle(icon, 32, POINT_STYLE_Z) : dot;
    }
    return shape;
  };
}

/** Point-only layers sit a band above any layer containing a path, so icons always render above paths. */
export function userLayerZIndex(layer: UserLayer): number {
  return layer.features.some(f => f.geometry.type !== "Point") ? PATH_LAYER_Z : ICON_LAYER_Z;
}
