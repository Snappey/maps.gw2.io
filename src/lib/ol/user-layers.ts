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
  });
  const shape = new Style({stroke, fill});

  return (feature: FeatureLike) => {
    if (feature.getGeometry()?.getType() === "Point") {
      const icon = feature.get("icon");
      return icon ? iconStyle(icon) : dot;
    }
    return shape;
  };
}
