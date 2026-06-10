import BaseLayer from "ol/layer/Base";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorTileLayer from "ol/layer/VectorTile";
import XYZ from "ol/source/XYZ";
import VectorSource from "ol/source/Vector";
import VectorTile from "ol/source/VectorTile";
import {StyleLike} from "ol/style/Style";
import {LayerState} from "../layer-state";
import {createTileGrid, getProjection, Gw2MapConfig} from "./gw2-projection";

/**
 * Declarative layer definitions — the seam that future layer kinds plug into:
 * user-made layers and realtime (MQTT/WvW) layers are `kind: "vector"` with a
 * caller-owned VectorSource whose features are mutated in place.
 */
export type LayerDefinition =
  | {kind: "raster"; config: Gw2MapConfig} & CommonLayerOptions
  | {kind: "vector-tile"; source: VectorTile; sourceLayer: string; style: StyleLike; declutter?: string | boolean; renderBuffer?: number} & CommonLayerOptions
  // style omitted -> features carry their own styles (e.g. live player markers)
  | {kind: "vector"; source: VectorSource; style?: StyleLike} & CommonLayerOptions;

export interface CommonLayerOptions {
  id: string;
  friendlyName?: string;
  icon?: string;
  state: LayerState;
  minZoomLevel?: number;
  maxZoomLevel?: number;
  opacityLevels?: {[zoomLevel: number]: number};
  zIndex?: number;
}

export function buildLayer(def: LayerDefinition): BaseLayer {
  switch (def.kind) {
    case "raster":
      return new TileLayer({
        source: new XYZ({
          projection: getProjection(def.config),
          tileGrid: createTileGrid(def.config),
          url: def.config.tileUrl,
          crossOrigin: "anonymous",
          attributions: def.config.attribution,
          wrapX: false,
        }),
        zIndex: def.zIndex ?? 0,
      });
    case "vector-tile":
      return new VectorTileLayer({
        source: def.source,
        style: def.style,
        declutter: def.declutter ?? false,
        renderBuffer: def.renderBuffer ?? 256,
        zIndex: def.zIndex ?? 1,
      });
    case "vector":
      return new VectorLayer({
        source: def.source,
        ...(def.style ? {style: def.style} : {}),
        zIndex: def.zIndex ?? 5,
        updateWhileAnimating: true,
        updateWhileInteracting: true,
      });
  }
}
