import {
  FeatureGroup, ImageOverlay,
  LatLng,
  Layer,
  Map,
  PointTuple,
  Polyline, svg,
} from 'leaflet';
import {filter, interval, map, Subscription, take} from "rxjs";
import {MqttConnectionState, MqttService} from "ngx-mqtt";
import {LabelService} from "../services/label.service";
import {LiveMarkersService} from "../services/live-markers.service";
import {Router} from "@angular/router";
import {NgZone} from "@angular/core";

export interface LayerOptions {
  Layer: Layer;
  MinZoomLevel?: number;
  MaxZoomLevel?: number;
  OpacityLevels?: {[zoomLevel: number]: number};
  Hidden: boolean;
}

export class BaseMap {
  Map!: Map;
  Layers: {[key: string]: LayerOptions} = {};

  liveMapState$ = this.liveMarkersService.stateChange.pipe(
    map(s => {
      switch (s) {
        case MqttConnectionState.CONNECTED:
          return "connected";
        case MqttConnectionState.CONNECTING:
          return "connecting";
        case MqttConnectionState.CLOSED:
          return "disconnected";
        default:
          return "unknown";
      }
    })
  )

  constructor(
    private ngZone: NgZone,
    private mqttService: MqttService,
    private labelService: LabelService,
    private liveMarkersService: LiveMarkersService,
    private router: Router) {
  }

  onMapInitialised(leaflet: Map) {

    // Live Markers
    const liveLayer = new FeatureGroup();
    this.registerLayer("LIVE_MAP", {Hidden: false, Layer: liveLayer});
    this.liveMarkersService.setActiveMapLayer(leaflet, liveLayer);

    // LatLng Url
    this.router.routerState.root.fragment.pipe(
      filter(fragment => !!fragment),
      take(1),
      map(fragment => fragment!.split(",").map(f => parseInt(f))),
      map(([lat, lng, zoom]): [LatLng, number] => [new LatLng(lat, lng), zoom])
    ).subscribe(([latLng, zoom]) => this.Map.setView(latLng, zoom));

    this.Map.on("zoomend", () => this.ngZone.run(() => this.router.navigate([], { fragment: [this.Map.getCenter().lat, this.Map.getCenter().lng, this.Map.getZoom()].join(",") })));
    this.Map.on("moveend", () => this.ngZone.run(() => this.router.navigate([], { fragment: [this.Map.getCenter().lat, this.Map.getCenter().lng, this.Map.getZoom()].join(",") })));

    // Drawing
    this.Map.on("mousedown", ($event) => {
      if ($event.originalEvent.button == this.RIGHT_MB) {
        this.createLine()
      }
    })
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
            (layerOptions.Layer as ImageOverlay).setOpacity(layerOptions.OpacityLevels[zoomLevel]);
            console.log("setting opacity");
          } else {
            (layerOptions.Layer as ImageOverlay).setOpacity(1);
          }
        }
      } else {
        //console.log("Hiding " + layersKey);
        this.hideLayer(layersKey);
      }

    }
  }

  private RIGHT_MB = 2
  private createLine() {
    const line = new Polyline([], { color: "#DDD", opacity: 0.9, renderer: svg() }).addTo(this.Map)
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
