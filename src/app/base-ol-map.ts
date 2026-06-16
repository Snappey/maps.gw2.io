import {inject, isDevMode, NgZone} from "@angular/core";
import {ActivatedRoute, Router} from "@angular/router";
import {HttpClient} from "@angular/common/http";
import {ToastrService} from "ngx-toastr";
import {ClipboardService} from "ngx-clipboard";
import {BehaviorSubject, combineLatestWith, debounceTime, distinctUntilChanged, filter, fromEvent, map, Subject, Subscription, switchMap, take, takeUntil} from "rxjs";
import {Feature} from "ol";
import {FeatureLike} from "ol/Feature";
import OlMap from "ol/Map";
import Overlay from "ol/Overlay";
import View from "ol/View";
import BaseLayer from "ol/layer/Base";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import LineString from "ol/geom/LineString";
import {Stroke, Style} from "ol/style";
import {Coordinate} from "ol/coordinate";
import TileLayer from "ol/layer/Tile";
import ImageTileSource from "ol/source/ImageTile";
import {LayerState} from "../lib/layer-state";
import {fragmentToView, getClampedExtent, getProjection, getResolutions, gw2ToOl, Gw2MapConfig, olToGw2, tileUrlFor, viewToFragment} from "../lib/ol/gw2-projection";
import {buildLayer, LayerDefinition} from "../lib/ol/layer-registry";
import {buildUserLayerSource, USER_LAYER_ID_PREFIX, userLayerStyle, userLayerZIndex} from "../lib/ol/user-layers";
import {attachRasterPrefetch} from "../lib/ol/tile-prefetch";
import {FloorController} from "../lib/ol/floor-controller";
import {FloorPickerState} from "../lib/ol/floor-lookup";
import {MapFloorInfo} from "../services/map.service";
import {UserLayer, UserLayerService} from "../services/user-layer.service";
// Type-only: the runtime modules (~25KB of dev/diagnostic tooling) are
// dynamically imported in enableFpsMeter, so they stay out of the prod bundle.
import type {FpsMeter} from "../lib/ol/fps-meter";
import type {BenchmarkResult} from "../lib/ol/pan-benchmark";
import type {ZoomBenchmarkResult} from "../lib/ol/zoom-benchmark";
import {WidgetService} from "../services/widget.service";
import {TOAST_TOP_RIGHT} from "../lib/toast-options";

export interface OlLayerOptions {
  layer: BaseLayer;
  minZoomLevel?: number;
  maxZoomLevel?: number;
  opacityLevels?: {[zoomLevel: number]: number};
  friendlyName?: string;
  icon?: string;
  state: LayerState;
  group?: string[];
  hideFromPanel?: boolean;
  keepOnHideAll?: boolean;
}

/**
 * `?fps` enables the meter anywhere — it must work in prod since dev-mode perf
 * isn't representative. sessionStorage keeps it sticky because in-app navigation
 * drops the query string (moveend fragment writes don't preserve it).
 */
function isFpsEnabled(): boolean {
  if (new URLSearchParams(window.location.search).has("fps")) {
    sessionStorage.setItem("gw2:fps", "1");
  }
  return isDevMode() || sessionStorage.getItem("gw2:fps") === "1";
}

export abstract class BaseOlMap {
  Map?: OlMap;
  /**
   * Live layer registry, mutated in place by register/unregister/layerUpdated.
   * `mapLayers$` mirrors it and re-emits on every change so the layer panel
   * re-renders.
   */
  mapLayers: {[key: string]: OlLayerOptions} = {};
  readonly mapLayers$ = new BehaviorSubject<{[key: string]: OlLayerOptions}>({});
  /** Visibility registry for on-map widgets (compass, FPS meter); used in templates. */
  protected readonly widgets = inject(WidgetService);
  protected readonly http = inject(HttpClient);
  protected readonly toastr = inject(ToastrService);
  protected readonly clipboard = inject(ClipboardService);
  protected readonly userLayerService = inject(UserLayerService);

  /** Completed on destroy; shared teardown for base + subclass subscriptions. */
  protected readonly unsubscribe$ = new Subject<void>();
  /** Layers eligible for hit-testing (tooltips/click); populated by subclasses. */
  protected readonly interactiveLayers = new Set<BaseLayer>();

  checkScreenSize = () => document.body.offsetWidth < 1024;
  smallScreen = this.checkScreenSize();

  protected fpsMeter?: FpsMeter;
  private fpsVisibilitySub?: Subscription;

  /** Per-layer prefetch detachers, so a raster swap doesn't leak listeners. */
  private prefetchTeardowns: {[id: string]: () => void} = {};
  private floorController?: FloorController;
  /** Current floor-picker state for the template; null hides the picker. */
  readonly floorState$ = new BehaviorSubject<FloorPickerState | null>(null);

  /** Set by subclasses to handle a clean right-click (no drag) — e.g. the dev editor menu. */
  protected onRightClick?: (event: PointerEvent) => void;

  protected constructor(
    protected ngZone: NgZone,
    protected route: ActivatedRoute,
    protected router: Router,
    protected readonly config: Gw2MapConfig,
  ) {
  }

  createView(options?: {center?: [number, number], zoom?: number, constrainResolution?: boolean}): View {
    return new View({
      projection: getProjection(this.config),
      resolutions: getResolutions(this.config),
      extent: getClampedExtent(this.config),
      center: gw2ToOl(options?.center ?? [this.config.width / 2, this.config.height / 2]),
      zoom: options?.zoom ?? 3,
      minZoom: this.config.minZoom,
      constrainResolution: options?.constrainResolution ?? false,
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

    // moveend covers zoom too and fires once per gesture — the old Leaflet
    // code wrote the fragment twice.
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

    this.enableRightClickDrawing(olMap);

    if (isFpsEnabled()) {
      // Defensive: initMap is already outside the zone today, but a per-frame
      // rAF loop inside the zone would trigger change detection every frame.
      this.ngZone.runOutsideAngular(() => void this.enableFpsMeter(olMap));
    }
  }

  /**
   * FPS widget + benchmarks: click the widget (or run gw2Bench() in the
   * console) for the pan benchmark; run gw2ZoomBench() for the full-range
   * zoom sweep over the map's densest marker areas.
   */
  private async enableFpsMeter(olMap: OlMap) {
    const [{FpsMeter}, {runPanBenchmark}, {runZoomBenchmark}] = await Promise.all([
      import("../lib/ol/fps-meter"),
      import("../lib/ol/pan-benchmark"),
      import("../lib/ol/zoom-benchmark"),
    ]);

    const summary = <T extends BenchmarkResult>(result: T): T => {
      this.fpsMeter?.showSummary(
        `${result.avgFps.toFixed(0)} fps avg | p95 ${result.p95FrameMs.toFixed(1)}ms | ${result.droppedFrames} dropped`);
      return result;
    };
    const bench = () => runPanBenchmark(olMap).then(summary);
    this.fpsMeter = new FpsMeter(olMap, {
      onClick: () => void bench().catch(err => this.fpsMeter?.showSummary(String(err instanceof Error ? err.message : err))),
    });
    // Visibility still follows the widget registry, so the Events panel (and any
    // future toggle) hides the meter too.
    this.fpsVisibilitySub = this.widgets.changes$.pipe(
      map(() => this.widgets.isVisible("fps")),
      distinctUntilChanged(),
    ).subscribe(visible => this.fpsMeter?.setVisible(visible));
    (window as {gw2Bench?: () => Promise<BenchmarkResult>}).gw2Bench = bench;
    (window as {gw2ZoomBench?: () => Promise<ZoomBenchmarkResult>}).gw2ZoomBench = () =>
      runZoomBenchmark(olMap, {indexUrl: this.chatLinkIndexUrl()}).then(summary);
  }

  /** The chat-link index doubles as gw2ZoomBench's marker-density source. */
  protected chatLinkIndexUrl(): string {
    const prefix = this.config.continentId === 1 ? "tyria" : "mists";
    return `assets/tiles/${prefix}_${this.config.continentId}_${this.config.floorId}.index.json`;
  }

  /** Tears down base-class-owned map resources; components call this from ngOnDestroy. */
  protected destroyMap(): void {
    this.floorController?.destroy();
    this.floorController = undefined;
    this.fpsVisibilitySub?.unsubscribe();
    this.fpsVisibilitySub = undefined;
    this.fpsMeter?.destroy();
    this.fpsMeter = undefined;
    delete (window as {gw2Bench?: unknown}).gw2Bench;
    delete (window as {gw2ZoomBench?: unknown}).gw2ZoomBench;
    // Floor swaps detach their prefetcher via unregisterLayer, but a base raster
    // layer still live at destroy never does — detach here too, or its listeners
    // and pending debounce post a stale prefetch batch after teardown.
    Object.values(this.prefetchTeardowns).forEach(teardown => teardown());
    this.prefetchTeardowns = {};
    this.Map?.setTarget(undefined);
    this.Map = undefined;
  }

  /**
   * Right-button drag draws a line that fades out over ~10s after release —
   * port of the Leaflet createLine in base-map.ts. Not a panel layer.
   */
  private enableRightClickDrawing(olMap: OlMap) {
    const drawSource = new VectorSource();
    olMap.addLayer(new VectorLayer({
      source: drawSource,
      zIndex: 99,
      style: feature => new Style({
        stroke: new Stroke({
          color: `rgba(221, 221, 221, ${feature.get("opacity") ?? 0.9})`,
          width: 3,
        }),
      }),
      updateWhileAnimating: true,
      updateWhileInteracting: true,
    }));

    const viewport = olMap.getViewport();
    viewport.addEventListener("contextmenu", e => e.preventDefault());

    const DRAG_THRESHOLD_PX = 4;

    viewport.addEventListener("pointerdown", (downEvent: PointerEvent) => {
      if (downEvent.button !== 2) {
        return;
      }
      // The line only starts once the pointer actually moves, so a clean
      // right-click can open the editor context menu instead.
      let line: Feature<LineString> | undefined;

      const onMove = (moveEvent: PointerEvent) => {
        if (!line) {
          const dx = moveEvent.clientX - downEvent.clientX;
          const dy = moveEvent.clientY - downEvent.clientY;
          if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
            return;
          }
          line = new Feature({geometry: new LineString([olMap.getEventCoordinate(downEvent)])});
          line.set("opacity", 0.9);
          drawSource.addFeature(line);
        }
        line.getGeometry()!.appendCoordinate(olMap.getEventCoordinate(moveEvent));
      };

      const onUp = () => {
        viewport.removeEventListener("pointermove", onMove);
        if (!line) {
          this.onRightClick?.(downEvent);
          return;
        }
        const drawn = line;
        // Fade .9 to 0 over ~10s (100 ticks of 100ms), then remove.
        const fade = setInterval(() => {
          const opacity = (drawn.get("opacity") as number) - 0.009;
          if (opacity <= 0) {
            clearInterval(fade);
            drawSource.removeFeature(drawn);
          } else {
            drawn.set("opacity", opacity);
          }
        }, 100);
      };

      viewport.addEventListener("pointermove", onMove);
      viewport.addEventListener("pointerup", onUp, {once: true});
    });
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
      group: def.group,
      hideFromPanel: def.hideFromPanel,
      keepOnHideAll: def.keepOnHideAll,
    };

    this.applyState(def.id);
    this.Map?.addLayer(layer);
    if (def.kind === "raster" && this.Map && layer instanceof TileLayer) {
      this.prefetchTeardowns[def.id] =
        attachRasterPrefetch(this.Map, layer as TileLayer<ImageTileSource>, def.config.tileUrl);
    }
    this.emitLayers();
    return layer;
  }

  hasLayer(id: string): boolean {
    return id in this.mapLayers;
  }

  unregisterLayer(id: string) {
    const options = this.mapLayers[id];
    if (options) {
      this.prefetchTeardowns[id]?.();
      delete this.prefetchTeardowns[id];
      this.Map?.removeLayer(options.layer);
      delete this.mapLayers[id];
      this.emitLayers();
    }
  }

  /**
   * Publishes a fresh registry snapshot to `mapLayers$`, inside the zone so the
   * panel updates even when called from OL callbacks / init (which run outside
   * Angular; re-entry is a no-op when already inside).
   */
  private emitLayers(): void {
    this.ngZone.run(() => this.mapLayers$.next({...this.mapLayers}));
  }

  /**
   * Swaps the raster base layer to a different floor by rebuilding it with a
   * new tile URL (ImageTileSource has no setUrl). Keeps the panel metadata,
   * state, and zIndex 0 so it stays under the overlays. No-op when the id isn't
   * a registered raster layer.
   */
  protected setRasterFloor(layerId: string, floorId: number): void {
    const options = this.mapLayers[layerId];
    if (!options) {
      return;
    }
    const {friendlyName, icon, state, group, keepOnHideAll} = options;
    this.unregisterLayer(layerId);
    this.registerLayer({
      kind: "raster",
      id: layerId,
      config: {...this.config, floorId, tileUrl: tileUrlFor(this.config.continentId, floorId)},
      friendlyName,
      icon,
      state,
      group,
      keepOnHideAll,
      zIndex: 0,
    });
  }

  /**
   * Starts the dynamic-floor picker once the map list has loaded. Both map
   * components call this from initMap with their raster layer's id.
   */
  protected initFloorPicker(
    rasterLayerId: string,
    maps: MapFloorInfo[],
    allowedTypes: readonly string[],
  ): void {
    if (!this.Map) {
      return;
    }
    this.floorController = new FloorController(
      this.Map,
      this.config,
      maps,
      allowedTypes,
      floorId => this.setRasterFloor(rasterLayerId, floorId),
      state => this.ngZone.run(() => this.floorState$.next(state)),
    );
  }

  /** Bound from the template; forwards a picker selection to the controller. */
  selectFloor(floorId: number): void {
    this.floorController?.selectFloor(floorId);
  }

  /** True once the dev/diagnostic FPS widget is mounted (bottom-left); the
   * floor picker shifts up to clear it. */
  get fpsVisible(): boolean {
    return !!this.fpsMeter;
  }

  layerUpdated([id, state]: [string, LayerState]) {
    if (this.mapLayers[id]) {
      this.mapLayers[id].state = state;
      this.applyState(id);
      this.emitLayers();
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
    const [x, y] = olToGw2(olCoordinate);
    return [Math.round(x), Math.round(y)];
  }

  /** Tracks viewport width for responsive layout; call once from ngOnInit. */
  protected initScreenSizeTracking(): void {
    fromEvent(window, "resize").pipe(
      debounceTime(200),
      map(this.checkScreenSize),
      takeUntil(this.unsubscribe$),
    ).subscribe(small => this.smallScreen = small);
  }

  /** Subscribes to the user's saved layers for this continent; call from initMap. */
  protected initUserLayers(): void {
    this.userLayerService.layersFor(this.config.continentId).pipe(
      takeUntil(this.unsubscribe$),
    ).subscribe(layers => this.ngZone.run(() => this.syncUserLayers(layers)));
  }

  /** Registers/refreshes user layers; runs inside the zone so the panel updates. */
  protected syncUserLayers(layers: UserLayer[]): void {
    for (const id of Object.keys(this.mapLayers).filter(id => id.startsWith(USER_LAYER_ID_PREFIX))) {
      this.interactiveLayers.delete(this.mapLayers[id].layer);
      this.unregisterLayer(id);
    }
    for (const userLayer of layers) {
      const layer = this.registerLayer({
        kind: "vector",
        id: userLayer.id,
        source: buildUserLayerSource(userLayer),
        style: userLayerStyle(userLayer.color),
        friendlyName: userLayer.name,
        group: userLayer.group,
        icon: "/assets/list_icon.png",
        state: LayerState.Enabled,
        zIndex: userLayerZIndex(userLayer),
      });
      this.interactiveLayers.add(layer);
    }
    // register/unregister above already re-emit mapLayers$ for the panel.
  }

  /** Removes user/imported layers by id (a whole group from the panel tree). */
  removeUserLayers(ids: string[]): void {
    ids.forEach(id => this.userLayerService.remove(id));
  }

  /** Hit-tests the registered interactive layers at a pixel. */
  protected featureAt(pixel: number[]): FeatureLike | undefined {
    return this.Map?.forEachFeatureAtPixel(pixel, f => f, {
      hitTolerance: 4,
      layerFilter: l => this.interactiveLayers.has(l),
    });
  }

  /** Builds a non-interactive tooltip overlay bound to `element` and adds it. */
  protected createTooltipOverlay(olMap: OlMap, element: HTMLElement, offset: [number, number]): Overlay {
    const overlay = new Overlay({element, offset, positioning: "center-left", stopEvent: false});
    olMap.addOverlay(overlay);
    return overlay;
  }

  /** Copies text to the clipboard and shows the standard top-right info toast. */
  protected copyToClipboard(text: string, message: string, title = ""): void {
    this.clipboard.copy(text);
    this.toastr.info(message, title, TOAST_TOP_RIGHT);
  }

  /**
   * Deep-link handler for the `:chatLink` route param: normalises the link,
   * looks it up in the map's chat-link index, and hands the coord to `onEntry`
   * (or toasts a not-found warning). Subclasses supply the pan/highlight detail.
   */
  protected handleChatLinkRoute(onEntry: (coord: [number, number]) => void): void {
    this.route.params.pipe(
      map(params => params["chatLink"] as string | undefined),
      take(1),
      filter((chatLink): chatLink is string => !!chatLink),
      map(chatLink => chatLink.replace(/^\[/, "").replace(/\]$/, "").replace(/=+$/, "")),
      switchMap(chatLink => this.http
        .get<{[key: string]: {coord: [number, number]}}>(this.chatLinkIndexUrl())
        .pipe(map(index => index[chatLink]))),
      takeUntil(this.unsubscribe$),
    ).subscribe(entry => {
      if (entry) {
        onEntry(entry.coord);
      } else {
        this.toastr.warning("Failed to find marker from url", "", TOAST_TOP_RIGHT);
      }
    });
  }
}
