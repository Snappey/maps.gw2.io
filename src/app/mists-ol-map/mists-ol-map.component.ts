import {AfterViewInit, Component, ElementRef, isDevMode, NgZone, OnDestroy, OnInit, ViewChild} from "@angular/core";
import {AsyncPipe} from "@angular/common";
import {HttpClient} from "@angular/common/http";
import {ActivatedRoute, Router} from "@angular/router";
import {Store} from "@ngrx/store";
import {ClipboardService} from "ngx-clipboard";
import {ToastrService} from "ngx-toastr";
import {combineLatestWith, debounceTime, filter, fromEvent, interval, map, Subject, switchMap, take, takeUntil} from "rxjs";

import OlMap from "ol/Map";
import Overlay from "ol/Overlay";
import {MapBrowserEvent} from "ol";
import {FeatureLike} from "ol/Feature";
import Layer from "ol/layer/Base";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import {defaults as defaultControls} from "ol/control/defaults";
import {PMTilesVectorSource} from "ol-pmtiles";
import {MVT} from "ol/format";

import {AppState} from "../../state/appState";
import {mistsActions} from "../../state/mists/mists.action";
import {liveMarkersActions} from "../../state/live-markers/live-markers.action";
import {selectUserAccountName} from "../../state/user/user.feature";
import {FullMatchObjective, Match, WvwService} from "../../services/wvw.service";
import {LiveMarkersService} from "../../services/live-markers.service";
import {ChromeModule} from "../chrome.module";
import {ToolbarButton} from "../toolbar/toolbar.component";
import {DialogModule} from "primeng/dialog";
import {OlLiveMarkersController} from "../../lib/ol/live-markers-layer";
import {BaseOlMap} from "../../lib/ol/base-ol-map";
import {LayerState} from "../../lib/layer-state";
import {createVectorTileGrid, getProjection, gw2ToOl, MISTS_MAP_CONFIG} from "../../lib/ol/gw2-projection";
import {
  createMistsStaticDefinitions,
  objectiveStyle,
  objectiveTooltipHtml,
  spawnHeadingStyle,
  syncObjectiveFeatures,
} from "../../lib/ol/mists-layers";
import {tooltipFor} from "../../lib/ol/tyria-layers";
import {buildUserLayerSource, userLayerStyle, USER_LAYER_ID_PREFIX} from "../../lib/ol/user-layers";
import {UserLayer, UserLayerService} from "../../services/user-layer.service";
import {ButtonModule} from "primeng/button";
import {LayerOptionsComponent} from "../layer-options/layer-options.component";
import {UserLayerManagerComponent} from "../user-layer-manager/user-layer-manager.component";

const EDGE_OF_THE_MISTS_MAP_ID = 968;
const MATCH_POLL_MS = 20_000;

@Component({
  selector: "app-mists-ol-map",
  standalone: true,
  imports: [LayerOptionsComponent, UserLayerManagerComponent, ButtonModule, DialogModule, ChromeModule, AsyncPipe],
  templateUrl: "./mists-ol-map.component.html",
  styleUrls: ["./mists-ol-map.component.css"],
})
export class MistsOlMapComponent extends BaseOlMap implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild("mapHost") mapHost!: ElementRef<HTMLDivElement>;
  @ViewChild("tooltipEl") tooltipEl!: ElementRef<HTMLDivElement>;

  private tooltipOverlay?: Overlay;
  private interactiveLayers = new Set<Layer>();
  private unsubscribe$ = new Subject<void>();

  showUserLayers = false;
  showSettings = false;
  showAbout = false;
  showLayers = false;
  showScore = false;
  showMatches = false;
  showObjectiveDetails = false;
  selectedObjective?: FullMatchObjective;

  checkScreenSize = () => document.body.offsetWidth < 1024;
  smallScreen: boolean = this.checkScreenSize();

  private objectivesSource = new VectorSource();
  private spawnSource = new VectorSource();
  private sectorOwnership = new Map<number, string>();
  private liveMarkers?: OlLiveMarkersController;

  activeMatch$ = this.store.select(state => state.mists.activeMatch);

  leftToolbar: ToolbarButton[] = [
    {
      Tooltip: "Info",
      Icon: "/assets/about_icon.png",
      IconHover: "/assets/about_hovered_icon.png",
      OnClick: () => this.showAbout = !this.showAbout
    },
    {
      Tooltip: "Settings",
      Icon: "/assets/settings_icon.png",
      IconHover: "/assets/settings_hovered_icon.png",
      OnClick: () => this.showSettings = !this.showSettings
    },
    {
      Tooltip: "Layers",
      Icon: "/assets/layer_icon.png",
      IconHover: "/assets/layer_hovered_icon.png",
      OnClick: () => this.showLayers = !this.showLayers,
      Keybindings: ["Digit1"]
    },
    {
      Tooltip: "Matches",
      Icon: "/assets/matches_icon.png",
      IconHover: "/assets/matches_hovered_icon.png",
      OnClick: () => this.showMatches = !this.showMatches,
      Keybindings: ["Digit2"]
    },
    {
      Tooltip: "Match Stats",
      Icon: "/assets/stats_icon.png",
      IconHover: "/assets/stats_hovered_icon.png",
      OnClick: () => this.showScore = !this.showScore,
      Keybindings: ["Digit3"]
    }
  ];

  rightToolbar: ToolbarButton[] = [
    {
      Tooltip: "Tyria",
      Icon: "/assets/tyria_icon.png",
      IconHover: "/assets/tyria_hovered_icon.png",
      OnClick: () => this.ngZone.run(() => this.router.navigate(["/tyria"]))
    }
  ];

  constructor(
    ngZone: NgZone,
    route: ActivatedRoute,
    router: Router,
    private store: Store<AppState>,
    private wvwService: WvwService,
    private liveMarkersService: LiveMarkersService,
    private userLayerService: UserLayerService,
    private http: HttpClient,
    private clipboard: ClipboardService,
    private toastr: ToastrService,
  ) {
    super(ngZone, route, router, MISTS_MAP_CONFIG);
  }

  ngOnInit() {
    this.store.dispatch(mistsActions.loadMatches());
    this.store.dispatch(liveMarkersActions.setActiveContinent({continentId: this.config.continentId as 1 | 2}));

    // Match selection: explicit :id (match or world id) or the settings home world.
    this.route.params.pipe(
      map(params => params["id"] as string | undefined),
      combineLatestWith(this.store.select(s => s.settings.homeWorld)),
      map(([id, homeWorldId]) => id ?? homeWorldId),
      takeUntil(this.unsubscribe$),
    ).subscribe(id => {
      if (id) {
        id.toString().includes("-") ?
          this.store.dispatch(mistsActions.setActiveMatch({matchId: id})) :
          this.store.dispatch(mistsActions.setActiveWorld({worldId: id}));
      } else {
        this.toastr.warning("Failed to find your home world, check your settings.", "Missing Home World",
          {timeOut: 10000, toastClass: "custom-toastr", positionClass: "toast-top-right"});
        this.showMatches = true;
      }
    });

    fromEvent(window, "resize").pipe(
      debounceTime(200),
      map(this.checkScreenSize),
      takeUntil(this.unsubscribe$),
    ).subscribe(small => this.smallScreen = small);

    interval(MATCH_POLL_MS).pipe(
      switchMap(() => this.store.select(state => state.mists.activeMatchId).pipe(take(1))),
      takeUntil(this.unsubscribe$),
    ).subscribe(activeMatchId => {
      if (activeMatchId) {
        this.store.dispatch(mistsActions.updateMatch({matchId: activeMatchId}));
      }
    });
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
      // Old Leaflet map: zoom 4.5 with zoomSnap .25 — keep fractional zoom.
      view: this.createView({center: [6400, 10240], zoom: 4.5, constrainResolution: false}),
      controls: defaultControls({zoom: false, rotate: false}),
    });

    this.onMapInitialised(olMap);
    if (isDevMode()) {
      (window as {olMap?: OlMap}).olMap = olMap;
    }

    this.registerLayer({
      kind: "raster",
      id: "mists_tiles",
      config: this.config,
      friendlyName: "Mists",
      icon: "/assets/mists_icon.png",
      state: LayerState.Enabled,
      zIndex: 0,
    });

    const vtSource = new PMTilesVectorSource({
      url: "assets/tiles/mists_2_1.pmtiles",
      projection: getProjection(this.config),
      tileGrid: createVectorTileGrid(this.config),
      format: new MVT(),
      wrapX: false,
    });

    for (const def of createMistsStaticDefinitions(vtSource, id => this.sectorOwnership.get(id))) {
      const layer = this.registerLayer(def);
      if (def.kind === "vector-tile" && def.sourceLayer === "waypoint") {
        this.interactiveLayers.add(layer);
      }
    }

    const objectivesLayer = this.registerLayer({
      kind: "vector",
      id: "mists_objective",
      source: this.objectivesSource,
      style: objectiveStyle,
      friendlyName: "Objectives",
      icon: "/assets/keep_icon.png",
      state: LayerState.Enabled,
      zIndex: 4,
    });
    this.interactiveLayers.add(objectivesLayer);

    this.liveMarkers = new OlLiveMarkersController(
      olMap,
      this.config.continentId,
      this.liveMarkersService.messages$,
      this.store.select(selectUserAccountName),
    );
    const liveLayer = this.registerLayer({
      kind: "vector",
      id: "LIVE_MAP",
      source: this.liveMarkers.source,
      friendlyName: "Live Map",
      icon: "/assets/player_marker.png",
      state: LayerState.Enabled,
      zIndex: 6,
    });
    this.interactiveLayers.add(liveLayer);

    this.registerLayer({
      kind: "vector",
      id: "mists_spawn_headings",
      source: this.spawnSource,
      style: spawnHeadingStyle,
      friendlyName: "Spawn Headings",
      icon: "/assets/list_icon.png",
      state: LayerState.Enabled,
      zIndex: 3,
    });

    // No match yet: show the neutral objective set.
    this.wvwService.getAllObjectives().pipe(
      take(1),
      takeUntil(this.unsubscribe$),
    ).subscribe(objectives => {
      if (this.objectivesSource.isEmpty()) {
        syncObjectiveFeatures(this.objectivesSource, this.spawnSource,
          objectives as never, EDGE_OF_THE_MISTS_MAP_ID);
      }
    });

    // Realtime: match poll drives objective properties + sector ownership.
    this.activeMatch$.pipe(
      filter(match => !!match),
      takeUntil(this.unsubscribe$),
    ).subscribe(match => {
      this.sectorOwnership = new Map(
        match!.objectives.map(obj => [obj.sector_id, obj.owner] as [number, string]));
      syncObjectiveFeatures(this.objectivesSource, this.spawnSource,
        match!.objectives as never, EDGE_OF_THE_MISTS_MAP_ID);
      // Sector colours live in a style closure over sectorOwnership; force re-render.
      this.mapLayers["mists_sector_objective"]?.layer.changed();
    });

    this.userLayerService.layersFor(this.config.continentId).pipe(
      takeUntil(this.unsubscribe$),
    ).subscribe(layers => this.ngZone.run(() => this.syncUserLayers(layers)));

    this.tooltipOverlay = new Overlay({
      element: this.tooltipEl.nativeElement,
      offset: [20, 0],
      positioning: "center-left",
      stopEvent: false,
    });
    olMap.addOverlay(this.tooltipOverlay);

    olMap.on("pointermove", e => this.onPointerMove(e));
    olMap.on("singleclick", e => this.onClick(e));

    this.ngZone.run(() => this.mapLayers = {...this.mapLayers});

    this.handleChatLinkRoute();
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
    const tooltipEl = this.tooltipEl.nativeElement;

    if (feature && ["waypoint", "live", "user"].includes(feature.get("layer"))) {
      tooltipEl.innerText = tooltipFor(feature) ?? "";
      tooltipEl.style.display = "block";
      this.tooltipOverlay?.setPosition(e.coordinate);
    } else if (feature && feature.get("name") !== undefined) {
      tooltipEl.innerHTML = objectiveTooltipHtml(feature);
      tooltipEl.style.display = "block";
      this.tooltipOverlay?.setPosition(e.coordinate);
    } else {
      tooltipEl.style.display = "none";
      this.tooltipOverlay?.setPosition(undefined);
    }
    this.Map!.getTargetElement().style.cursor = feature ? "pointer" : "";
  }

  overviewMatchClicked(match: Match) {
    this.store.dispatch(mistsActions.setActiveMatch({matchId: match.id}));
    this.showMatches = false;
  }

  private onClick(e: MapBrowserEvent) {
    const feature = this.featureAt(e.pixel);
    if (!feature) {
      return;
    }

    // Match objectives open the upgrade details dialog (like the old map);
    // everything else copies its chat link.
    const objective = feature.get("objective_data") as FullMatchObjective | undefined;
    if (objective && objective.owner !== undefined) {
      this.ngZone.run(() => {
        this.selectedObjective = objective;
        this.showObjectiveDetails = true;
      });
      return;
    }

    const chatLink = feature.get("chat_link");
    if (!chatLink) {
      return;
    }
    const name = feature.get("name") || feature.get("tooltip") || chatLink;
    this.ngZone.run(() => {
      this.clipboard.copy(chatLink);
      this.toastr.info(`Copied [${name}] to clipboard!`, "", {
        toastClass: "custom-toastr",
        positionClass: "toast-top-right",
      });
    });
  }

  private handleChatLinkRoute() {
    this.route.params.pipe(
      map(params => params["chatLink"] as string | undefined),
      take(1),
      filter((chatLink): chatLink is string => !!chatLink),
      map(chatLink => chatLink.replace(/^\[/, "").replace(/\]$/, "").replace(/=+$/, "")),
      switchMap(chatLink => this.http
        .get<{[key: string]: {coord: [number, number]}}>(`assets/tiles/mists_${this.config.continentId}_${this.config.floorId}.index.json`)
        .pipe(map(index => index[chatLink]))),
    ).subscribe(entry => {
      if (entry) {
        this.panTo(entry.coord, 6);
      } else {
        this.toastr.warning("Failed to find marker from url", "", {
          toastClass: "custom-toastr",
          positionClass: "toast-top-right",
        });
      }
    });
  }
}
