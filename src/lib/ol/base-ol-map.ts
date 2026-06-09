import {NgZone} from "@angular/core";
import {ActivatedRoute, Router} from "@angular/router";
import {combineLatestWith, filter, map, take} from "rxjs";
import OlMap from "ol/Map";
import View from "ol/View";
import BaseLayer from "ol/layer/Base";
import {Coordinate} from "ol/coordinate";
import {LayerState} from "../layer-state";
import {fragmentToView, getExtent, getProjection, getResolutions, gw2ToOl, Gw2MapConfig, viewToFragment} from "./gw2-projection";
import {buildLayer, LayerDefinition} from "./layer-registry";

export interface OlLayerOptions {
  layer: BaseLayer;
  minZoomLevel?: number;
  maxZoomLevel?: number;
  opacityLevels?: {[zoomLevel: number]: number};
  friendlyName?: string;
  icon?: string;
  state: LayerState;
}

export abstract class BaseOlMap {
  Map?: OlMap;
  mapLayers: {[key: string]: OlLayerOptions} = {};

  protected constructor(
    protected ngZone: NgZone,
    protected route: ActivatedRoute,
    protected router: Router,
    protected readonly config: Gw2MapConfig,
  ) {
  }

  createView(): View {
    return new View({
      projection: getProjection(this.config),
      resolutions: getResolutions(this.config),
      extent: getExtent(this.config),
      center: gw2ToOl([this.config.width / 2, this.config.height / 2]),
      zoom: 3,
      minZoom: this.config.minZoom,
      constrainResolution: true,
      enableRotation: false,
      showFullExtent: true,
    });
  }

  /** Call once the OL map exists; wires fragment persistence + zoom-based opacity. */
  protected onMapInitialised(olMap: OlMap) {
    this.Map = olMap;

    // Restore "#lat,lng,zoom" (Leaflet CRS.Simple format) unless deep-linked to a marker.
    this.router.routerState.root.fragment.pipe(
      combineLatestWith(this.route.params),
      filter(([fragment, params]) => !!fragment && !("chatLink" in params)),
      take(1),
      map(([fragment, _]) => fragmentToView(fragment!, this.config)),
    ).subscribe(view => {
      if (view) {
        olMap.getView().setCenter(view.center);
        olMap.getView().setZoom(view.zoom);
      }
    });

    // moveend fires once per pan/zoom gesture and covers zoom changes too —
    // unlike the old Leaflet code which wrote the fragment twice.
    olMap.on("moveend", () => {
      const view = olMap.getView();
      const center = view.getCenter();
      const zoom = view.getZoom();
      if (!center || zoom === undefined) {
        return;
      }
      this.ngZone.run(() => this.router.navigate([], {
        replaceUrl: true,
        fragment: viewToFragment(center, zoom, this.config),
      }));
    });

    olMap.getView().on("change:resolution", () => this.applyOpacityLevels());
    this.applyOpacityLevels();
  }

  panTo(coords: [number, number], zoom: number = 4) {
    this.Map?.getView().animate({center: gw2ToOl(coords), zoom, duration: 400});
  }

  registerLayer(def: LayerDefinition): BaseLayer {
    if (this.hasLayer(def.id)) {
      console.warn("attempted to register duplicate layer as " + def.id);
      return this.mapLayers[def.id].layer;
    }

    const layer = buildLayer(def);
    this.mapLayers[def.id] = {
      layer,
      minZoomLevel: def.minZoomLevel,
      maxZoomLevel: def.maxZoomLevel,
      opacityLevels: def.opacityLevels,
      friendlyName: def.friendlyName ?? def.id,
      icon: def.icon,
      state: def.state,
    };

    this.applyState(def.id);
    this.Map?.addLayer(layer);
    return layer;
  }

  hasLayer(id: string): boolean {
    return id in this.mapLayers;
  }

  layerUpdated([id, state]: [string, LayerState]) {
    if (this.mapLayers[id]) {
      this.mapLayers[id].state = state;
      this.applyState(id);
    }
  }

  /**
   * Zoom-range visibility is delegated to OL layer min/max zoom (no manual
   * zoomend plumbing). OL semantics are exclusive-at-min, inclusive-at-max;
   * with integer-constrained zoom, +-0.5 reproduces Leaflet's inclusive range.
   */
  private applyState(id: string) {
    const options = this.mapLayers[id];
    const layer = options.layer;
    switch (options.state) {
      case LayerState.Enabled:
      case LayerState.Hidden: // legacy state; OL auto-hides outside the zoom range
        layer.setVisible(true);
        layer.setMinZoom(options.minZoomLevel !== undefined ? options.minZoomLevel - 0.5 : -Infinity);
        layer.setMaxZoom(options.maxZoomLevel !== undefined ? options.maxZoomLevel + 0.5 : Infinity);
        break;
      case LayerState.Disabled:
        layer.setVisible(false);
        break;
      case LayerState.Pinned:
        layer.setVisible(true);
        layer.setMinZoom(-Infinity);
        layer.setMaxZoom(Infinity);
        break;
    }
  }

  private applyOpacityLevels() {
    const zoom = this.Map?.getView().getZoom();
    if (zoom === undefined) {
      return;
    }
    const rounded = Math.round(zoom);
    for (const options of Object.values(this.mapLayers)) {
      if (options.opacityLevels) {
        options.layer.setOpacity(options.opacityLevels[rounded] ?? 1);
      }
    }
  }

  getCoords(olCoordinate: Coordinate): [number, number] {
    return [Math.round(olCoordinate[0]), Math.round(-olCoordinate[1])];
  }
}
