import * as L from 'leaflet';
import {
  FeatureGroup, Icon,
  LatLng,
  Layer, LeafletMouseEvent,
  Map, Marker, Point, PointTuple, Polyline, TileLayer,
} from 'leaflet';
import {interval, Observable, Subscription, take} from "rxjs";
import {IMqttMessage, MqttService} from "ngx-mqtt";
import {LabelService} from "../services/label.service";

export interface LayerOptions {
  Layer: Layer;
  MinZoomLevel?: number;
  MaxZoomLevel?: number;
  OpacityLevels?: {[zoomLevel: number]: number};
  Hidden: boolean;
}

export interface MapPosition {
  X: number;
  Y: number;
}

export interface CharacterForward {
  X: number;
  Y: number;
  Z: number;
}

export interface LivePlayerData {
  Character: string;
  MapPosition: MapPosition;
  CharacterForward: CharacterForward;
  IsCommander: boolean;
  MapId: number;
}


export class BaseMap {
  Map!: Map;
  Layers: {[key: string]: LayerOptions} = {};

  constructor(private mqttService: MqttService, private labelService: LabelService) {
    const liveLayer = new FeatureGroup();
    const markers: {[player: string]: Marker} = {};
    const zeroVector:CharacterForward = { X: 1, Y: 0, Z: 0 }
    this.registerLayer("LIVE_MAP", {Hidden: false, Layer: liveLayer})

    this.mqttService.observe('maps.gw2.io/global/#').subscribe((message: IMqttMessage) => {
      if (!this.Map) {
        return
      }

      const data = JSON.parse(message.payload.toString()) as LivePlayerData;
      const latLng = this.Map.unproject([data.MapPosition.X, data.MapPosition.Y], this.Map.getMaxZoom())
      const rotation = this.degreesBetweenVectors(data.CharacterForward, zeroVector)

      if (data.Character in markers) {
        // @ts-ignore
        markers[data.Character].options.img.rotate = rotation
        markers[data.Character]
          .setLatLng(latLng);
      } else {
        markers[data.Character] = labelService.createCanvasMarker(this.Map, [data.MapPosition.X, data.MapPosition.Y], "/assets/player_marker.png", rotation)
          .bindTooltip(data.Character, {className: "tooltip-overlay", offset: new Point(15, 0)})
          .addTo(liveLayer);
      }

      liveLayer.bringToFront();
    });
  }

  degreesBetweenVectors(vector1: CharacterForward, vector2: CharacterForward) {
    const dotProduct = vector1.X * vector2.X + vector1.Y * vector2.Y;
    const magnitude1 = Math.sqrt(vector1.X * vector1.X + vector1.Y * vector1.Y);
    const magnitude2 = Math.sqrt(vector2.X * vector2.X + vector2.Y * vector2.Y);
    const cosTheta = dotProduct / (magnitude1 * magnitude2);
    const thetaRadians = Math.acos(cosTheta);
    const crossProduct = vector1.X * vector2.Y - vector1.Y * vector2.X;
    const sign = crossProduct >= 0 ? 1 : -1;
    return sign * thetaRadians * (180 / Math.PI);
  }

  public panTo(coords: PointTuple, zoom: number = 4) {
    const latLng = this.Map.unproject(coords, this.Map.getMaxZoom());
    this.Map.setView(latLng, zoom);
  }

  updateLayer(id: string, layer: Layer) {
    if (this.hasLayer(id)) {
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

    this.Layers[id] = options;

    if (this.Map) {
      if (!options.Hidden) {
        this.Map.addLayer(options.Layer);
      }

      this.updateLayerVisibility(this.Map.getZoom())
    }

    if (id !== "core") {
      //this.layersControls.overlays[this.friendlyLayerNames[id] ?? id] = options.Layer
    }
  }

  unregisterLayer(id: string) {
    if (this.Layers[id]) {
      this.Map.removeLayer(this.Layers[id].Layer);
      delete this.Layers[id];
    }
  }

  showLayer(id: string) {
    if (this.Layers[id]) {
      const options = this.Layers[id];

      if (!this.Map.hasLayer(options.Layer)) {
        this.Map.addLayer(options.Layer);
        options.Hidden = false;
      }
    }
  }

  hideLayer(id: string) {
    if (this.Layers[id]) {
      const options = this.Layers[id];

      if (this.Map.hasLayer(options.Layer)) {
        this.Map.removeLayer(options.Layer);
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

  setupDrawing() {
    this.Map.on("mousedown", ($event) => {
      if ($event.originalEvent.button == this.RIGHT_MB) {
        this.createLine()
      }
    })
  }

  private RIGHT_MB = 2

  private createLine() {
    const line = new Polyline([], { color: "#DDD", opacity: 0.9 }).addTo(this.Map)
    let isDrawing = true;
    let trimLine: Subscription;

    this.Map.on("mousemove", ($event) => {
      if (isDrawing) {
        line.addLatLng($event.latlng)
      }
    })
    this.Map.once("mouseup", (_) => {
      isDrawing = false
      trimLine = interval(100).pipe(
        take(100)
      ).subscribe({
        next: i =>
          line.setStyle({
            opacity: 1.0 - (i * .01)
          })
        ,
        complete: () => line.removeFrom(this.Map)
      })
    })
  }
}
