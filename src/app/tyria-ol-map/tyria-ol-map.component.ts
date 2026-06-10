import {AfterViewInit, Component, ElementRef, isDevMode, NgZone, OnDestroy, OnInit, ViewChild} from "@angular/core";
import {Store} from "@ngrx/store";
import {HttpClient} from "@angular/common/http";
import {ActivatedRoute, Router} from "@angular/router";
import {ClipboardService} from "ngx-clipboard";
import {ToastrService} from "ngx-toastr";
import {filter, map, Subject, take, takeUntil} from "rxjs";

import OlMap from "ol/Map";
import Overlay from "ol/Overlay";
import {MapBrowserEvent} from "ol";
import {FeatureLike} from "ol/Feature";
import Layer from "ol/layer/Base";
import VectorTileLayer from "ol/layer/VectorTile";
import VectorSource from "ol/source/Vector";
import {defaults as defaultControls} from "ol/control/defaults";
import {PMTilesVectorSource} from "ol-pmtiles";
import {MVT} from "ol/format";

import {BaseOlMap} from "../../lib/ol/base-ol-map";
import {LayerState} from "../../lib/layer-state";
import {AppState} from "../../state/appState";
import {liveMarkersActions} from "../../state/live-markers/live-markers.action";
import {selectUserAccountName} from "../../state/user/user.feature";
import {EventTimerService} from "../../services/event-timer.service";
import {LiveMarkersService} from "../../services/live-markers.service";
import {OlLiveMarkersController} from "../../lib/ol/live-markers-layer";
import {createVectorTileGrid, getProjection, gw2ToOl, TYRIA_MAP_CONFIG} from "../../lib/ol/gw2-projection";
import {chatLinkFor, createTyriaOverlayDefinitions, HEART_BOUNDS_STYLE, syncEventFeatures, tooltipFor, wikiUrlFor} from "../../lib/ol/tyria-layers";
import {iconStyle} from "../../lib/ol/marker-styles";
import {buildUserLayerSource, userLayerStyle, USER_LAYER_ID_PREFIX} from "../../lib/ol/user-layers";
import {UserLayer, UserLayerService} from "../../services/user-layer.service";
import {OlEditor} from "../../lib/ol/editor";
import {MarkerType} from "../../services/editor.service";
import {ButtonModule} from "primeng/button";
import {DialogService} from "primeng/dynamicdialog";
import {LayerOptionsComponent} from "../layer-options/layer-options.component";
import {UserLayerManagerComponent} from "../user-layer-manager/user-layer-manager.component";
import {MapContextMenuComponent, MapContextMenuItem} from "../map-context-menu/map-context-menu.component";
import {EditorModalComponent} from "../tyria-map/editor-modal/editor-modal.component";

interface ChatLinkIndexEntry {
  coord: [number, number];
  tooltip: string;
  type: string;
}

@Component({
  selector: "app-tyria-ol-map",
  standalone: true,
  imports: [LayerOptionsComponent, UserLayerManagerComponent, ButtonModule, MapContextMenuComponent],
  providers: [DialogService],
  templateUrl: "./tyria-ol-map.component.html",
  styleUrls: ["./tyria-ol-map.component.css"],
})
export class TyriaOlMapComponent extends BaseOlMap implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild("mapHost") mapHost!: ElementRef<HTMLDivElement>;
  @ViewChild("tooltipEl") tooltipEl!: ElementRef<HTMLDivElement>;
  @ViewChild("highlightEl") highlightEl!: ElementRef<HTMLImageElement>;

  showUserLayers = false;

  // Dev editor (replaces the leaflet-contextmenu flow)
  contextMenuItems: MapContextMenuItem[] = [];
  contextMenuPosition?: {x: number, y: number};
  private editor = new OlEditor();

  private tooltipOverlay?: Overlay;
  private highlightOverlay?: Overlay;
  private heartBoundsLayer?: VectorTileLayer;
  private highlightedHeartId?: number;
  private interactiveLayers = new Set<Layer>();
  private eventsSource = new VectorSource();
  private unsubscribe$ = new Subject<void>();
  private liveMarkers?: OlLiveMarkersController;

  constructor(
    ngZone: NgZone,
    route: ActivatedRoute,
    router: Router,
    private http: HttpClient,
    private clipboard: ClipboardService,
    private toastr: ToastrService,
    private eventTimerService: EventTimerService,
    private liveMarkersService: LiveMarkersService,
    private userLayerService: UserLayerService,
    private dialogService: DialogService,
    private store: Store<AppState>,
  ) {
    super(ngZone, route, router, TYRIA_MAP_CONFIG);
  }

  /** Dev-only marker/text placement via right-click context menu. */
  private initEditor(olMap: OlMap) {
    const markersLayer = this.registerLayer({
      kind: "vector", id: "editable_markers", source: this.editor.markersSource,
      minZoomLevel: 3, friendlyName: "Editor Markers", icon: "/assets/poi.png",
      state: LayerState.Enabled, zIndex: 7,
    });
    this.registerLayer({
      kind: "vector", id: "editable_text", source: this.editor.textSource,
      minZoomLevel: 2, maxZoomLevel: 6, opacityLevels: {5: .8, 6: .5},
      friendlyName: "Editor Text", icon: "/assets/list_icon.png",
      state: LayerState.Enabled, zIndex: 7,
    });
    this.interactiveLayers.add(markersLayer as Layer);

    this.onRightClick = (event: PointerEvent) => {
      const pixel = olMap.getEventPixel(event);
      // Right-clicking a placed editor feature deletes it, like the old editor.
      const editorHit = olMap.forEachFeatureAtPixel(pixel, f => f, {
        hitTolerance: 4,
        layerFilter: l => l === markersLayer,
      });
      if (editorHit && this.editor.removeFeature(editorHit)) {
        return;
      }

      const coords = this.getCoords(olMap.getEventCoordinate(event));
      this.ngZone.run(() => {
        this.contextMenuItems = this.buildContextMenu(coords);
        this.contextMenuPosition = {x: pixel[0], y: pixel[1]};
      });
    };
  }

  private buildContextMenu(coords: [number, number]): MapContextMenuItem[] {
    const place = (header: string, type: MarkerType): MapContextMenuItem =>
      ({label: header, action: () => this.placeMarker(header, type, coords)});

    return [
      {...place("Place Waypoint", MarkerType.Waypoint), icon: "assets/waypoint.png"},
      {...place("Place PoI", MarkerType.Poi), icon: "assets/poi.png"},
      {...place("Place Vista", MarkerType.Vista), icon: "assets/vista.png"},
      {...place("Place Heart", MarkerType.Heart), icon: "assets/hearts.png"},
      {...place("Place Mastery", MarkerType.Mastery), icon: "assets/core_mastery.png"},
      {...place("Place Hero Point", MarkerType.SkillPoint), icon: "assets/heropoint.png"},
      place("Place Unlock", MarkerType.Unlock),
      {label: "-1", separator: true},
      place("Place Region Text", MarkerType.Region),
      place("Place Map Text", MarkerType.Map),
      {label: "-2", separator: true},
      {label: "Copy Marker JSON", action: () => this.clipboard.copy(this.editor.exportMarkers())},
      {label: "Copy Text JSON", action: () => this.clipboard.copy(this.editor.exportText())},
      {label: "-3", separator: true},
      {label: "Center On", icon: "assets/zoom-in.png", action: () => this.panTo(coords, this.Map?.getView().getZoom() ?? 4)},
      {label: "Copy Coordinates", action: () => this.clipboard.copy(JSON.stringify(coords))},
    ];
  }

  private placeMarker(header: string, type: MarkerType, coords: [number, number]) {
    this.ngZone.run(() => {
      this.dialogService.open(EditorModalComponent, {
        header,
        data: {type, coords},
      })?.onClose.pipe(take(1)).subscribe(metadata => {
        if (!metadata) {
          return;
        }
        this.ngZone.runOutsideAngular(() => {
          if (type === MarkerType.Map || type === MarkerType.Region) {
            this.editor.addText(type, coords, metadata);
          } else {
            this.editor.addMarker(type, coords, metadata);
          }
        });
      });
    });
  }

  /** Registers/refreshes user layers; runs inside the zone so the panel updates. */
  private syncUserLayers(layers: UserLayer[]) {
    for (const id of Object.keys(this.mapLayers).filter(id => id.startsWith(USER_LAYER_ID_PREFIX))) {
      this.interactiveLayers.delete(this.mapLayers[id].layer as Layer);
      this.unregisterLayer(id);
    }
    for (const userLayer of layers) {
      const layer = this.registerLayer({
        kind: "vector",
        id: userLayer.id,
        source: buildUserLayerSource(userLayer),
        style: userLayerStyle(userLayer.color),
        friendlyName: userLayer.name,
        icon: "/assets/list_icon.png",
        state: LayerState.Enabled,
        zIndex: 5,
      });
      this.interactiveLayers.add(layer as Layer);
    }
    this.mapLayers = {...this.mapLayers};
  }

  ngOnInit() {
    this.store.dispatch(liveMarkersActions.setActiveContinent({continentId: this.config.continentId as 1 | 2}));
  }

  ngAfterViewInit() {
    this.ngZone.runOutsideAngular(() => this.initMap());
  }

  ngOnDestroy() {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.liveMarkers?.destroy();
    this.Map?.setTarget(undefined);
  }

  private initMap() {
    const olMap = new OlMap({
      target: this.mapHost.nativeElement,
      view: this.createView({center: [46720, 33280], zoom: 3}),
      controls: defaultControls({zoom: false, rotate: false}),
    });

    this.onMapInitialised(olMap);
    if (isDevMode()) {
      // Debug/E2E hook only; not part of the public surface.
      (window as {olMap?: OlMap}).olMap = olMap;
    }

    this.registerLayer({
      kind: "raster",
      id: "core",
      config: this.config,
      friendlyName: "Tyria",
      icon: "/assets/tyria_icon.png",
      state: LayerState.Enabled,
      zIndex: 0,
    });

    const vtSource = new PMTilesVectorSource({
      url: "assets/tiles/tyria_1_1.pmtiles",
      projection: getProjection(this.config),
      tileGrid: createVectorTileGrid(this.config),
      format: new MVT(),
      wrapX: false,
    });

    for (const def of createTyriaOverlayDefinitions(vtSource)) {
      const layer = this.registerLayer(def);
      if (def.kind === "vector-tile" && !def.sourceLayer.startsWith("label_") && def.sourceLayer !== "sector_bounds") {
        this.interactiveLayers.add(layer);
      }
    }

    // Live players via MQTT; the controller animates features in place.
    this.liveMarkers = new OlLiveMarkersController(
      olMap,
      this.config.continentId,
      this.liveMarkersService.messages$,
      this.store.select(selectUserAccountName),
    );
    if (isDevMode()) {
      (window as {liveMarkers?: unknown}).liveMarkers = this.liveMarkers;
    }
    const liveLayer = this.registerLayer({
      kind: "vector",
      id: "LIVE_MAP",
      source: this.liveMarkers.source,
      friendlyName: "Live Map",
      icon: "/assets/player_marker.png",
      state: LayerState.Enabled,
      zIndex: 6,
    });
    this.interactiveLayers.add(liveLayer as Layer);

    // World bosses: 15s timer upserts markers for events within 30 minutes.
    const eventsLayer = this.registerLayer({
      kind: "vector",
      id: "events_layer",
      source: this.eventsSource,
      style: () => iconStyle("assets/event-boss.png"),
      friendlyName: "World Bosses",
      icon: "/assets/event-boss.png",
      state: LayerState.Enabled,
      zIndex: 4,
    });
    this.interactiveLayers.add(eventsLayer as Layer);

    this.eventTimerService.getNextEventsTimer(8).pipe(
      takeUntil(this.unsubscribe$),
    ).subscribe(events => syncEventFeatures(this.eventsSource, events as never));

    // User-made layers from localStorage; re-synced on every import/delete.
    this.userLayerService.layersFor(this.config.continentId).pipe(
      takeUntil(this.unsubscribe$),
    ).subscribe(layers => this.ngZone.run(() => this.syncUserLayers(layers)));

    if (isDevMode()) {
      this.initEditor(olMap);
    }

    // Always-on hover highlight for heart bounds; not part of the layer panel.
    this.heartBoundsLayer = new VectorTileLayer({
      source: vtSource,
      zIndex: 1,
      style: feature =>
        feature.get("layer") === "heart_bounds" && feature.get("heart_id") === this.highlightedHeartId
          ? HEART_BOUNDS_STYLE
          : undefined,
    });
    olMap.addLayer(this.heartBoundsLayer);

    this.tooltipOverlay = new Overlay({
      element: this.tooltipEl.nativeElement,
      offset: [25, 0],
      positioning: "center-left",
      stopEvent: false,
    });
    olMap.addOverlay(this.tooltipOverlay);

    this.highlightOverlay = new Overlay({
      element: this.highlightEl.nativeElement,
      positioning: "center-center",
      stopEvent: false,
    });
    olMap.addOverlay(this.highlightOverlay);

    olMap.on("pointermove", e => this.onPointerMove(e));
    olMap.on("singleclick", e => this.onClick(e));
    olMap.on("dblclick", e => this.onDoubleClick(e));

    // Notify Angular about the registered layers so the panel renders.
    this.ngZone.run(() => this.mapLayers = {...this.mapLayers});

    this.handleChatLinkRoute();
  }

  private featureAt(pixel: number[]): FeatureLike | undefined {
    return this.Map?.forEachFeatureAtPixel(pixel, f => f, {
      hitTolerance: 4,
      layerFilter: l => this.interactiveLayers.has(l),
    });
  }

  private onPointerMove(e: MapBrowserEvent) {
    if (e.dragging) {
      return;
    }
    const feature = this.featureAt(e.pixel);
    const tooltip = feature ? tooltipFor(feature) : undefined;

    const tooltipEl = this.tooltipEl.nativeElement;
    if (tooltip) {
      tooltipEl.innerText = tooltip;
      tooltipEl.style.display = "block";
      this.tooltipOverlay?.setPosition(e.coordinate);
    } else {
      tooltipEl.style.display = "none";
      this.tooltipOverlay?.setPosition(undefined);
    }
    this.Map!.getTargetElement().style.cursor = feature ? "pointer" : "";

    const heartId = feature?.get("layer") === "heart" ? feature.get("id") : undefined;
    if (heartId !== this.highlightedHeartId) {
      this.highlightedHeartId = heartId;
      this.heartBoundsLayer?.changed();
    }
  }

  private onClick(e: MapBrowserEvent) {
    const feature = this.featureAt(e.pixel);
    if (!feature) {
      return;
    }
    const chatLink = chatLinkFor(feature);
    if (!chatLink) {
      return;
    }
    const tooltip = tooltipFor(feature);
    this.ngZone.run(() => {
      this.clipboard.copy(chatLink);
      // World bosses copy their closest waypoint, like the old event markers.
      const msg = feature.get("layer") === "event" ?
        "Copied closest waypoint to clipboard!" :
        tooltip && tooltip !== chatLink ?
          `Copied [${tooltip}] to clipboard!` :
          `Copied ${chatLink} to clipboard!`;
      this.toastr.info(msg, feature.get("layer") === "event" ? feature.get("name") : "", {
        toastClass: "custom-toastr",
        positionClass: "toast-top-right",
      });
    });
  }

  private onDoubleClick(e: MapBrowserEvent): boolean | void {
    const feature = this.featureAt(e.pixel);
    const url = feature ? wikiUrlFor(feature) : undefined;
    if (url) {
      window.open(url);
      return false; // stop DoubleClickZoom
    }
  }

  private handleChatLinkRoute() {
    this.route.params.pipe(
      map(params => params["chatLink"] as string | undefined),
      take(1),
      filter((chatLink): chatLink is string => !!chatLink),
      map(chatLink => chatLink
        .replace(/^\[/, "")
        .replace(/\]$/, "")
        .replace(/=+$/, "")),
    ).subscribe(chatLink =>
      this.http.get<{[key: string]: ChatLinkIndexEntry}>(`assets/tiles/tyria_${this.config.continentId}_${this.config.floorId}.index.json`)
        .subscribe(index => {
          const entry = index[chatLink];
          if (!entry) {
            this.toastr.warning("Failed to find marker from url", "", {
              toastClass: "custom-toastr",
              positionClass: "toast-top-right",
            });
            return;
          }
          this.highlightEl.nativeElement.style.display = "block";
          this.highlightOverlay?.setPosition(gw2ToOl(entry.coord));
          this.panTo(entry.coord, 7);
        }));
  }
}
