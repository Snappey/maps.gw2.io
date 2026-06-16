import {AfterViewInit, Component, ElementRef, HostListener, inject, isDevMode, NgZone, OnDestroy, OnInit, ViewChild} from "@angular/core";
import {Store} from "@ngrx/store";
import {ActivatedRoute, Router} from "@angular/router";
import {AsyncPipe} from "@angular/common";
import {BehaviorSubject, catchError, Observable, of, take, takeUntil} from "rxjs";

import OlMap from "ol/Map";
import Overlay from "ol/Overlay";
import {MapBrowserEvent} from "ol";
import Layer from "ol/layer/Base";
import VectorTileLayer from "ol/layer/VectorTile";
import VectorSource from "ol/source/Vector";
import {defaults as defaultControls} from "ol/control/defaults";
import {PMTilesVectorSource} from "ol-pmtiles";
import {MVT} from "ol/format";

import {BaseOlMap} from "../base-ol-map";
import {LayerState} from "../../lib/layer-state";
import {AppState} from "../../state/appState";
import {liveMarkersActions} from "../../state/live-markers/live-markers.action";
import {selectUserAccountName} from "../../state/user/user.feature";
import {Event, EventMap, EventTimerService} from "../../services/event-timer.service";
import {LiveMarkersService} from "../../services/live-markers.service";
import {SidebarLiveMarker} from "../../lib/live-marker-types";
import {ToolbarButton, ToolbarComponent} from "../toolbar/toolbar.component";
import {sharedLeftToolbarButtons} from "../toolbar/toolbar-buttons";
import {AboutModalComponent} from "../about-modal/about-modal.component";
import {EventGridComponent} from "../event-grid/event-grid.component";
import {LiveMarkerSidebarComponent} from "../live-marker-sidebar/live-marker-sidebar.component";
import {SettingsModalComponent} from "../settings-modal/settings-modal.component";
import {WizardVaultGridComponent} from "../wizard-vault-grid/wizard-vault-grid.component";
import {TooltipModule} from "primeng/tooltip";
import {OlLiveMarkersController} from "../../lib/ol/live-markers-layer";
import {createVectorTileGrid, getProjection, gw2ToOl, TYRIA_MAP_CONFIG} from "../../lib/ol/gw2-projection";
import {
  createTyriaOverlayDefinitions, HEART_BOUNDS_STYLE, mergedMarkerStyle, sublayerVisible,
  syncEventFeatures, TYRIA_MARKER_SUBLAYERS,
} from "../../lib/ol/tyria-layers";
import {PinOverlays} from "../../lib/ol/pin-overlays";
import {buildUserLayerSource, userLayerStyle, userLayerZIndex, TACO_PACK_ATTRIBUTION} from "../../lib/ol/user-layers";
import {chatLinkFor, tooltipFor, wikiUrlFor} from "../../lib/ol/feature-meta";
import {iconStyle} from "../../lib/ol/marker-styles";
import {LabelEntry, LabelOverlays} from "../../lib/ol/label-overlay";
import {CloudOverlay} from "../../lib/ol/cloud-overlay";
import {throttleVectorTileParsing} from "../../lib/ol/vt-parse-queue";
import {attachMarkerPrefetch} from "../../lib/ol/marker-prefetch";
import {preloadPmtilesIntoMemory} from "../../lib/ol/pmtiles-preload";
import {OlEditor} from "../../lib/ol/editor";
import {MarkerType} from "../../lib/editor-types";
import {ButtonModule} from "primeng/button";
import {DialogService} from "primeng/dynamicdialog";
import {LayerOptionsComponent} from "../layer-options/layer-options.component";
import {UserLayerManagerComponent} from "../user-layer-manager/user-layer-manager.component";
import {MapContextMenuComponent, MapContextMenuItem} from "../map-context-menu/map-context-menu.component";
import {EditorModalComponent} from "../editor-modal/editor-modal.component";
import {FloorPickerComponent} from "../floor-picker/floor-picker.component";
import {MapService} from "../../services/map.service";
import {TacoTrailsService} from "../../services/taco-trails.service";
import {CORE_FLOOR_MAP_TYPES} from "../../lib/ol/floor-lookup";
import {MenuPanelService} from "../../services/menu-panel.service";
import {WidgetService} from "../../services/widget.service";
import {TacoDropDirective} from "../taco-drop/taco-drop.directive";

@Component({
  selector: "app-tyria-ol-map",
  standalone: true,
  imports: [LayerOptionsComponent, UserLayerManagerComponent, ButtonModule, TooltipModule,
    MapContextMenuComponent, AsyncPipe, FloorPickerComponent, TacoDropDirective,
    ToolbarComponent, AboutModalComponent, EventGridComponent, LiveMarkerSidebarComponent,
    SettingsModalComponent, WizardVaultGridComponent],
  providers: [DialogService, MenuPanelService, WidgetService],
  templateUrl: "./tyria-ol-map.component.html",
  styleUrls: ["./tyria-ol-map.component.css"],
})
export class TyriaOlMapComponent extends BaseOlMap implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild("mapHost") mapHost!: ElementRef<HTMLDivElement>;
  @ViewChild("tooltipEl") tooltipEl!: ElementRef<HTMLDivElement>;
  @ViewChild("highlightEl") highlightEl!: ElementRef<HTMLImageElement>;

  /** Tracks which single overlay is open so opening one closes the others. */
  protected readonly menu = inject(MenuPanelService);

  upcomingEvents$: Observable<EventMap> = this.eventTimerService.getNextEventsTimer(8);
  liveMarkerList$ = new BehaviorSubject<SidebarLiveMarker[]>([]);

  leftToolbar: ToolbarButton[] = [
    ...sharedLeftToolbarButtons(this.menu),
    {
      Tooltip: "Live Markers",
      Icon: "/assets/friends_icon.png",
      IconHover: "/assets/friends_hovered_icon.png",
      OnClick: () => this.menu.toggle("liveMarkers"),
      PanelId: "liveMarkers",
      Keybindings: ["Digit2"]
    },
    {
      Tooltip: "Events",
      Icon: "/assets/event_icon.png",
      IconHover: "/assets/event_hovered_icon.png",
      OnClick: () => this.menu.toggle("events"),
      PanelId: "events",
      Keybindings: ["Digit3"]
    },
    {
      Tooltip: "Wizards Vault",
      Icon: "/assets/wizard_vault_icon.png",
      IconHover: "/assets/wizard_vault_hovered_icon.png",
      OnClick: () => this.menu.toggle("wizardsVault"),
      PanelId: "wizardsVault",
      Keybindings: ["Digit4"]
    }
  ];

  rightToolbar: ToolbarButton[] = [
    {
      Tooltip: "WvW",
      Icon: "/assets/mists_icon.png",
      IconHover: "/assets/mists_hovered_icon.png",
      OnClick: () => this.ngZone.run(() => this.router.navigate(["/wvw"]))
    }
  ];

  // Dev editor (replaces the leaflet-contextmenu flow)
  contextMenuItems: MapContextMenuItem[] = [];
  contextMenuPosition?: {x: number, y: number};
  private editor = new OlEditor();

  private tooltipOverlay?: Overlay;
  private highlightOverlay?: Overlay;
  private headingLabels?: LabelOverlays;
  private clouds?: CloudOverlay;
  private heartBoundsLayer?: VectorTileLayer;
  private markersLayer?: VectorTileLayer;
  private markerPrefetchTeardown?: () => void;
  private pmtilesPreloadTeardown?: () => void;
  private markerVisibilitySignature = "";
  // Pinned marker kinds render at every zoom from a full, non-tiled overlay;
  // the controller owns the lazy load + per-kind cache (see PinOverlays).
  private pins?: PinOverlays;
  private highlightedHeartId?: number;
  private eventsSource = new VectorSource();
  private liveMarkers?: OlLiveMarkersController;

  constructor(
    ngZone: NgZone,
    route: ActivatedRoute,
    router: Router,
    private eventTimerService: EventTimerService,
    private liveMarkersService: LiveMarkersService,
    private dialogService: DialogService,
    private store: Store<AppState>,
    private mapService: MapService,
    private tacoTrailsService: TacoTrailsService,
  ) {
    super(ngZone, route, router, TYRIA_MAP_CONFIG);
  }

  /** Escape closes whichever overlay is open (PrimeNG dialogs also self-close). */
  @HostListener("document:keydown.escape")
  onEscape() {
    this.menu.close();
  }

  /** Dev-only marker/text placement via right-click context menu. */
  private initEditor(olMap: OlMap) {
    const markersLayer = this.registerLayer({
      kind: "vector", id: "editable_markers", source: this.editor.markersSource,
      minZoomLevel: 3, friendlyName: "Editor Markers", icon: "/assets/poi.png",
      state: LayerState.Enabled, hideFromPanel: true, zIndex: 7,
    });
    this.registerLayer({
      kind: "vector", id: "editable_text", source: this.editor.textSource,
      minZoomLevel: 2, maxZoomLevel: 6, opacityLevels: {5: .8, 6: .5},
      friendlyName: "Editor Text", icon: "/assets/list_icon.png",
      state: LayerState.Enabled, hideFromPanel: true, zIndex: 7,
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
        this.menu.close();
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

  ngOnInit() {
    this.store.dispatch(liveMarkersActions.setActiveContinent({continentId: this.config.continentId}));
    this.initScreenSizeTracking();
  }

  panToEvent(event: Event) {
    this.panTo(event.coordinates, 5);
    if (event.chatLink) {
      this.copyToClipboard(event.chatLink, "Copied closest waypoint to clipboard!", event.name);
    }
    this.menu.close("events");
  }

  ngAfterViewInit() {
    this.ngZone.runOutsideAngular(() => this.initMap());
  }

  ngOnDestroy() {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.markerPrefetchTeardown?.();
    this.pmtilesPreloadTeardown?.();
    this.liveMarkers?.destroy();
    this.headingLabels?.destroy();
    this.clouds?.destroy();
    this.pins?.destroy();
    this.destroyMap();
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

    this.initBaseRaster();
    this.initClouds(olMap);
    const vtSource = this.initMarkerLayer(olMap);
    this.initHeadingLabels(olMap);
    this.initLiveMarkers(olMap);
    this.initEvents();
    // User-made layers from localStorage; re-synced on every import/delete.
    this.initUserLayers();
    // Bundled community TacO marker layers (off by default).
    this.initTacoTrails();
    if (isDevMode()) {
      this.initEditor(olMap);
    }
    this.initHeartHighlight(olMap, vtSource);
    this.initInteractionOverlays(olMap);

    this.pins = new PinOverlays(
      olMap, this.interactiveLayers,
      url => this.http.get<any[]>(url).pipe(take(1)),
      id => this.mapLayers[id]?.state === LayerState.Pinned,
    );

    // Dynamic raster floors: once the map list loads, watch the view and offer
    // the floors available where the user is looking. Failure hides the picker.
    this.mapService.getAllMaps().pipe(take(1), catchError(() => of([]))).subscribe(
      maps => this.ngZone.runOutsideAngular(() => this.initFloorPicker("core", maps, CORE_FLOOR_MAP_TYPES)));

    this.handleChatLinkRoute(coord => {
      this.highlightEl.nativeElement.style.display = "block";
      this.highlightOverlay?.setPosition(gw2ToOl(coord));
      this.panTo(coord, 7);
    });
  }

  /** The Tyria raster base layer (floor-swappable). */
  private initBaseRaster(): void {
    this.registerLayer({
      kind: "raster",
      id: "core",
      config: this.config,
      friendlyName: "Tyria",
      icon: "/assets/tyria_icon.png",
      state: LayerState.Enabled,
      group: ["World Map"],
      keepOnHideAll: true,
      zIndex: 0,
    });
  }

  /**
   * "Above the clouds" sheet for the zoomed-out world view. The OL layer is a
   * panel-toggle stub (empty source); the visible effect is a CSS-driven DOM
   * overlay that follows its visibility and fades out as you zoom in (CloudOverlay).
   */
  private initClouds(olMap: OlMap): void {
    this.registerLayer({
      kind: "vector",
      id: "clouds",
      source: new VectorSource(),
      friendlyName: "Clouds",
      icon: "/assets/skyscale_icon.png",
      state: LayerState.Enabled,
      group: ["World Map"],
      zIndex: 0,
    });
    this.clouds = new CloudOverlay(olMap, {
      textures: ["/assets/sky00.png", "/assets/sky01.png"],
      fadeStartZoom: this.config.minZoom,
      fadeEndZoom: 4,
      maxOpacity: 0.85,
      layer: this.mapLayers["clouds"].layer,
    });
  }

  /**
   * Builds the shared PMTiles vector source and the merged marker layer that
   * renders every icon kind (the panel stubs from createTyriaOverlayDefinitions
   * carry per-kind state the style function consults). Returns the source so the
   * heart-bounds highlight layer can reuse it.
   */
  private initMarkerLayer(olMap: OlMap): PMTilesVectorSource {
    const vtSource = new PMTilesVectorSource({
      url: "assets/tiles/tyria_1_1.pmtiles",
      projection: getProjection(this.config),
      tileGrid: createVectorTileGrid(this.config),
      // Parse only the source-layers something actually styles: the heading
      // text layers (label_region/label_map) are drawn by the SVG overlay,
      // and MVT geometry decoding is the dominant pan-spike cost.
      format: new MVT({
        layers: [...TYRIA_MARKER_SUBLAYERS.map(s => s.sourceLayer), "label_sector", "sector_bounds", "heart_bounds"],
      }),
      wrapX: false,
      // Parsed source tiles (shared by the marker/sector/heart layers) cost
      // main-thread decode time, so keep enough that panning back never
      // re-parses. With the archive in memory (preloadPmtilesIntoMemory) a miss
      // is only a re-parse, not a network fetch.
      cacheSize: 1024,
    });
    throttleVectorTileParsing(vtSource,
      () => olMap.getView().getAnimating() || olMap.getView().getInteracting());

    for (const def of createTyriaOverlayDefinitions(vtSource)) {
      this.registerLayer(def);
    }

    this.markersLayer = new VectorTileLayer({
      source: vtSource,
      style: mergedMarkerStyle(this.config.maxZoom, id => this.mapLayers[id]?.state ?? LayerState.Enabled),
      renderBuffer: 256,
      preload: 1,
      cacheSize: 256,
      zIndex: 2,
    });
    olMap.addLayer(this.markersLayer);
    this.interactiveLayers.add(this.markersLayer);
    olMap.getView().on("change:resolution", () => this.syncMarkerVisibility());
    this.syncMarkerVisibility();

    // Warm a ring + adjacent zooms of marker tiles so icons are ready as the
    // user pans/zooms in, instead of fetch+parsing on demand (the pop-in).
    this.markerPrefetchTeardown = attachMarkerPrefetch(olMap, vtSource);
    // Pull the whole archive into memory so marker tile reads stop hitting the
    // network — the dominant cost on a remote CDN, where pmtiles' no-store
    // bypass makes every uncached tile a fresh Range request.
    this.pmtilesPreloadTeardown = preloadPmtilesIntoMemory(vtSource, "assets/tiles/tyria_1_1.pmtiles");

    return vtSource;
  }

  /** Region/map heading text drawn by the SVG label overlay. */
  private initHeadingLabels(olMap: OlMap): void {
    this.http.get<any[]>("assets/data/region_labels_1_1.json").pipe(take(1)).subscribe(raw => {
      const entries: LabelEntry[] = raw
        .filter(l => l.label_coordinates != null)
        .map(l => ({
          coord: gw2ToOl(l.label_coordinates),
          heading: l.heading,
          subheading: l.subheading || undefined,
          kind: (l.type as string).toLowerCase() as "region" | "map",
        }));
      this.headingLabels = new LabelOverlays(olMap, [
        {
          entries: entries.filter(e => e.kind === "region"),
          layer: this.mapLayers["region_labels"].layer,
          minZoom: 2, maxZoom: 5, opacityLevels: {5: .2, 4: .6},
        },
        {
          entries: entries.filter(e => e.kind === "map"),
          layer: this.mapLayers["map_labels"].layer,
          minZoom: 3, maxZoom: 5, opacityLevels: {5: .7},
        },
      ]);
    });
  }

  /** Live players via MQTT; the controller animates features in place. */
  private initLiveMarkers(olMap: OlMap): void {
    this.liveMarkers = new OlLiveMarkersController(
      olMap,
      this.config.continentId,
      this.liveMarkersService.messages$,
      this.store.select(selectUserAccountName),
    );
    if (isDevMode()) {
      (window as {liveMarkers?: unknown}).liveMarkers = this.liveMarkers;
    }
    this.liveMarkers.activeMarkers$.pipe(
      takeUntil(this.unsubscribe$),
    ).subscribe(markers => this.ngZone.run(() => this.liveMarkerList$.next(markers)));
    const liveLayer = this.registerLayer({
      kind: "vector",
      id: "LIVE_MAP",
      source: this.liveMarkers.source,
      friendlyName: "Live Map",
      icon: "/assets/player_marker.png",
      state: LayerState.Enabled,
      group: ["World Map"],
      zIndex: 6,
    });
    this.interactiveLayers.add(liveLayer as Layer);
  }

  /** Events: 15s timer upserts markers for meta events within 30 minutes. */
  private initEvents(): void {
    const eventsLayer = this.registerLayer({
      kind: "vector",
      id: "events_layer",
      source: this.eventsSource,
      style: () => iconStyle("assets/event-boss.png"),
      friendlyName: "Events",
      icon: "/assets/event-boss.png",
      state: LayerState.Enabled,
      group: ["Activities"],
      zIndex: 4,
    });
    this.interactiveLayers.add(eventsLayer as Layer);

    this.eventTimerService.getNextEventsTimer(8).pipe(
      takeUntil(this.unsubscribe$),
    ).subscribe(events => syncEventFeatures(this.eventsSource, events));
  }

  /**
   * Bundled TacO overlay layers (committed by scripts/generate_taco_trails.mjs),
   * registered as vector layers under the "Lady Elyssa's Markers" panel group,
   * off by default. Registered directly (not via UserLayerService) with a
   * "taco_" id, so syncUserLayers — which tears down "user_" layers on every
   * change — leaves them be.
   */
  private initTacoTrails(): void {
    this.tacoTrailsService.getLayers().pipe(
      take(1),
      takeUntil(this.unsubscribe$),
    ).subscribe(layers => this.ngZone.run(() => {
      for (const layer of layers.filter(l => l.continentId === this.config.continentId)) {
        const source = buildUserLayerSource(layer);
        source.setAttributions(TACO_PACK_ATTRIBUTION);
        const olLayer = this.registerLayer({
          kind: "vector",
          id: layer.id,
          source,
          style: userLayerStyle(layer.color),
          friendlyName: layer.name,
          group: layer.group,
          icon: "/assets/list_icon.png",
          state: LayerState.Disabled,
          zIndex: userLayerZIndex(layer),
        });
        this.interactiveLayers.add(olLayer as Layer);
      }
    }));
  }

  /**
   * Hover highlight for heart bounds; not part of the layer panel. Hidden until
   * a heart is hovered — while visible it re-processes every tile of the shared
   * source on every rendered frame.
   */
  private initHeartHighlight(olMap: OlMap, vtSource: PMTilesVectorSource): void {
    this.heartBoundsLayer = new VectorTileLayer({
      source: vtSource,
      zIndex: 1,
      visible: false,
      style: feature =>
        feature.get("layer") === "heart_bounds" && feature.get("heart_id") === this.highlightedHeartId
          ? HEART_BOUNDS_STYLE
          : undefined,
    });
    olMap.addLayer(this.heartBoundsLayer);
  }

  /** Tooltip + highlight overlays and the pointer interaction handlers. */
  private initInteractionOverlays(olMap: OlMap): void {
    this.tooltipOverlay = this.createTooltipOverlay(olMap, this.tooltipEl.nativeElement, [25, 0]);

    this.highlightOverlay = new Overlay({
      element: this.highlightEl.nativeElement,
      positioning: "center-center",
      stopEvent: false,
    });
    olMap.addOverlay(this.highlightOverlay);

    olMap.on("pointermove", e => this.onPointerMove(e));
    olMap.on("singleclick", e => this.onClick(e));
    olMap.on("dblclick", e => this.onDoubleClick(e));
  }

  /**
   * Marker styles are baked into the merged layer's render tiles, so a state
   * toggle or a zoom crossing a sublayer threshold needs a rebuild — OL's own
   * per-layer min/max zoom no longer applies to individual icon kinds.
   */
  private syncMarkerVisibility(force = false): void {
    const zoom = this.Map?.getView().getZoom();
    if (zoom === undefined) {
      return;
    }
    const signature = TYRIA_MARKER_SUBLAYERS
      .map(sub => sublayerVisible(sub, this.mapLayers[sub.id]?.state ?? sub.state, zoom) ? "1" : "0")
      .join("");
    if (force || signature !== this.markerVisibilitySignature) {
      this.markerVisibilitySignature = signature;
      this.markersLayer?.changed();
    }
  }

  override layerUpdated(event: [string, LayerState]) {
    super.layerUpdated(event);
    if (TYRIA_MARKER_SUBLAYERS.some(sub => sub.id === event[0])) {
      this.syncMarkerVisibility(true);
      this.pins?.sync(event[0], event[1] === LayerState.Pinned);
    }
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
      this.heartBoundsLayer?.setVisible(heartId !== undefined);
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
    // World bosses copy their closest waypoint, like the old event markers.
    const isEvent = feature.get("layer") === "event";
    const msg = isEvent ?
      "Copied closest waypoint to clipboard!" :
      tooltip && tooltip !== chatLink ?
        `Copied [${tooltip}] to clipboard!` :
        `Copied ${chatLink} to clipboard!`;
    this.ngZone.run(() => this.copyToClipboard(chatLink, msg, isEvent ? feature.get("name") : ""));
  }

  private onDoubleClick(e: MapBrowserEvent): boolean | void {
    const feature = this.featureAt(e.pixel);
    const url = feature ? wikiUrlFor(feature) : undefined;
    if (url) {
      window.open(url);
      return false; // stop DoubleClickZoom
    }
  }

}
