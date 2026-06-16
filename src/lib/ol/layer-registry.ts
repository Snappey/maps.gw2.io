import BaseLayer from "ol/layer/Base";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorTileLayer from "ol/layer/VectorTile";
import ImageTileSource from "ol/source/ImageTile";
import VectorSource from "ol/source/Vector";
import VectorTile from "ol/source/VectorTile";
import {StyleLike} from "ol/style/Style";
import {LayerState} from "../layer-state";
import {createTileGrid, getProjection, Gw2MapConfig} from "./gw2-projection";

/**
 * Declarative layer definitions — the seam future layer kinds plug into.
 * User-made and realtime (MQTT/WvW) layers are `kind: "vector"` with a
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
  /** Ancestor group names for the layer panel tree (e.g. pack → map). */
  group?: string[];
  /** When true the layer renders on the map but is omitted from the layer panel. */
  hideFromPanel?: boolean;
  /** When true the panel's global "hide all" leaves this layer visible (the base map). */
  keepOnHideAll?: boolean;
  minZoomLevel?: number;
  maxZoomLevel?: number;
  opacityLevels?: {[zoomLevel: number]: number};
  zIndex?: number;
}

export function buildLayer(def: LayerDefinition): BaseLayer {
  switch (def.kind) {
    case "raster":
      // ImageTile (not XYZ) decodes via createImageBitmap off the main
      // thread; with XYZ, the first drawImage of each freshly loaded tile
      // sync-decoded the JPEG inside the frame — measured as 25-120ms pan
      // spikes whenever a batch of tiles arrived.
      return new TileLayer({
        source: new ImageTileSource({
          projection: getProjection(def.config),
          tileGrid: createTileGrid(def.config),
          url: def.config.tileUrl,
          crossOrigin: "anonymous",
          attributions: def.config.attribution,
          wrapX: false,
          // At fractional zooms between two native levels, fetch the deeper
          // (sharper) tile instead of upscaling the coarser one, so the map
          // looks crisp mid-step. Can't sharpen the z>maxNativeZoom overzoom
          // band (no deeper raster exists) — it clamps to the deepest tile.
          zDirection: -1,
        }),
        // The whole ancestor pyramid is only a handful of tiles, and having it
        // loaded means zooming out never shows blank squares.
        preload: Infinity,
        // The renderer reuses up to cacheSize/2 stale tiles as placeholders
        // while the target zoom loads, so a large cache is what stops tiles
        // popping out when switching zoom levels (default is 512).
        cacheSize: 1024,
        zIndex: def.zIndex ?? 0,
      });
    case "vector-tile":
      return new VectorTileLayer({
        source: def.source,
        style: def.style,
        declutter: def.declutter ?? false,
        renderBuffer: def.renderBuffer ?? 256,
        // One ancestor level warm and a real render-tile cache (default
        // auto-grows from 0) stop overlays blinking out during zoom changes.
        // Source tiles are shared across all overlay layers, so the network
        // cost is paid once — but MVT parsing runs on the main thread, so
        // keep preload shallow or panning stutters.
        preload: 1,
        cacheSize: 256,
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
