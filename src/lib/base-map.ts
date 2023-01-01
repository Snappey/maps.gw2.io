import * as L from 'leaflet';
import {
  Layer,
  Map, PointTuple, TileLayer,
} from 'leaflet';

export interface LayerOptions {
  Layer: Layer;
  MinZoomLevel?: number;
  MaxZoomLevel?: number;
  OpacityLevels?: {[zoomLevel: number]: number};
  Hidden: boolean;
}

export class BaseMap {
  Map: Map | undefined;
  Layers: {[key: string]: LayerOptions} = {};

  public panTo(coords: PointTuple, zoom: number = 4) {
    if (this.Map) {
      const latLng = this.Map.unproject(coords, this.Map.getMaxZoom());
      this.Map.setView(latLng, zoom);
    }
  }

  updateLayer(id: string, layer: Layer) {
    if (id in this.Layers && this.Map) {
      this.Map.removeLayer(this.Layers[id].Layer);

      this.Layers[id].Layer = layer;
      this.Map.addLayer(layer);
    }
  }

  hasLayer(id: string): boolean {
    return id in this.Layers;
  }

  registerLayer(id: string, options: LayerOptions) {
    if (this.hasLayer(id)) {
      console.warn("attempted to register duplicate layer as " + id);
      return;
    }

    if (!options.Hidden) {
      this.Map?.addLayer(options.Layer);
    }

    this.Layers[id] = options;

    if (this.Map) {
      this.updateLayerVisibility(this.Map.getZoom())
    }

    if (id !== "core") {
      //this.layersControls.overlays[this.friendlyLayerNames[id] ?? id] = options.Layer
    }
  }

  unregisterLayer(id: string) {
    if (this.Layers[id]) {
      this.Map?.removeLayer(this.Layers[id].Layer);
      delete this.Layers[id];
    }
  }

  showLayer(id: string) {
    if (this.Layers[id]) {
      const options = this.Layers[id];

      if (!this.Map?.hasLayer(options.Layer)) {
        this.Map?.addLayer(options.Layer);
        options.Hidden = false;
      }
    }
  }

  hideLayer(id: string) {
    if (this.Layers[id]) {
      const options = this.Layers[id];

      if (this.Map?.hasLayer(options.Layer)) {
        this.Map?.removeLayer(options.Layer);
        options.Hidden = true;
      }
    }
  }

  updateLayerVisibility(zoomLevel: number) {
    if (!this.Map) {
      return;
    }

    for (let layersKey in this.Layers) {
      const layerOptions = this.Layers[layersKey];
      const minZoom = layerOptions.MinZoomLevel ?? this.Map.getMinZoom();
      const maxZoom = layerOptions.MaxZoomLevel ?? this.Map.getMaxZoom();

      if (zoomLevel >= minZoom && zoomLevel <= maxZoom) {
        //console.log("Showing " + layersKey);
        this.showLayer(layersKey);

        if (layerOptions.OpacityLevels) {
          if (zoomLevel in layerOptions.OpacityLevels) {
            //console.log("Updating layer opacity to " + layerOptions.OpacityLevels[zoomLevel]);
            (layerOptions.Layer as TileLayer).setOpacity(layerOptions.OpacityLevels[zoomLevel]);
          } else {
            (layerOptions.Layer as TileLayer).setOpacity(1);
          }
        }

      } else {
        //console.log("Hiding " + layersKey);
        this.hideLayer(layersKey);
      }

    }
  }

}
