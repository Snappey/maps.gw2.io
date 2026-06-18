import {AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, HostListener, inject, isDevMode, NgZone, OnDestroy, OnInit, ViewChild} from "@angular/core";
import {AsyncPipe} from "@angular/common";
import {ActivatedRoute, Router} from "@angular/router";
import {Store} from "@ngrx/store";
import {catchError, combineLatestWith, filter, interval, map, of, switchMap, take, takeUntil} from "rxjs";

import OlMap from "ol/Map";
import Overlay from "ol/Overlay";
import {MapBrowserEvent} from "ol";
import VectorSource from "ol/source/Vector";
import {defaults as defaultControls} from "ol/control/defaults";

import {AppState} from "../../state/appState";
import {mistsActions} from "../../state/mists/mists.action";
import {selectActiveMatch} from "../../state/mists/mists.feature";
import {liveMarkersActions} from "../../state/live-markers/live-markers.action";
import {selectUserAccountName} from "../../state/user/user.feature";
import {FullMatchObjective, Match, WvwService} from "../../services/wvw.service";
import {LiveMarkersService} from "../../services/live-markers.service";
import {ToolbarButton, ToolbarComponent} from "../toolbar/toolbar.component";
import {sharedLeftToolbarButtons} from "../toolbar/toolbar-buttons";
import {AboutModalComponent} from "../about-modal/about-modal.component";
import {SettingsModalComponent} from "../settings-modal/settings-modal.component";
import {MatchOverviewComponent} from "../mists-chrome/match-overview/match-overview.component";
import {ObjectiveDetailsComponent} from "../mists-chrome/objective-details/objective-details.component";
import {ObjectiveTooltipComponent} from "../mists-chrome/objective-tooltip/objective-tooltip.component";
import {SkirmishStatsChartComponent} from "../mists-chrome/skirmish-stats-chart/skirmish-stats-chart.component";
import {DialogModule} from "primeng/dialog";
import {OlLiveMarkersController} from "../../lib/ol/live-markers-layer";
import {BaseOlMap} from "../base-ol-map";
import {LayerState} from "../../lib/layer-state";
import {gw2ToOl, MISTS_MAP_CONFIG} from "../../lib/ol/gw2-projection";
import {
  createMistsStaticDefinitions,
  objectiveStyle,
  RECENT_FLIP_WINDOW_MS,
  spawnHeadingStyle,
  syncObjectiveFeatures,
} from "../../lib/ol/mists-layers";
import {buildMarkerFeatures, markerFeaturesUrl, MarkerFeatureJson} from "../../lib/ol/marker-source";
import {tooltipFor} from "../../lib/ol/feature-meta";
import {LabelOverlays} from "../../lib/ol/label-overlay";
import {ButtonModule} from "primeng/button";
import {LayerOptionsComponent} from "../layer-options/layer-options.component";
import {UserLayerManagerComponent} from "../user-layer-manager/user-layer-manager.component";
import {WarScoreBarComponent} from "../mists-chrome/war-score-bar/war-score-bar.component";
import {SkirmishDetailsComponent} from "../mists-chrome/skirmish-details/skirmish-details.component";
import {MatchHistoryComponent} from "../mists-chrome/match-history/match-history.component";
import {MenuPanelService} from "../../services/menu-panel.service";
import {WidgetService} from "../../services/widget.service";
import {TacoDropDirective} from "../taco-drop/taco-drop.directive";

interface RegionLabelJson {
  label_coordinates: [number, number] | null;
  heading: string;
  subheading?: string;
}

const EDGE_OF_THE_MISTS_MAP_ID = 968;
const MATCH_POLL_MS = 20_000;

@Component({
  selector: "app-mists-ol-map",
  standalone: true,
  imports: [LayerOptionsComponent, UserLayerManagerComponent, ButtonModule, DialogModule, AsyncPipe,
    WarScoreBarComponent, SkirmishDetailsComponent, MatchHistoryComponent, TacoDropDirective,
    ToolbarComponent, AboutModalComponent, SettingsModalComponent, MatchOverviewComponent,
    ObjectiveDetailsComponent, ObjectiveTooltipComponent, SkirmishStatsChartComponent],
  providers: [MenuPanelService, WidgetService],
  templateUrl: "./mists-ol-map.component.html",
  styleUrls: ["./mists-ol-map.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MistsOlMapComponent extends BaseOlMap implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild("mapHost") mapHost!: ElementRef<HTMLDivElement>;
  @ViewChild("tooltipEl") tooltipEl!: ElementRef<HTMLDivElement>;
  @ViewChild("tooltipTextEl") tooltipTextEl!: ElementRef<HTMLSpanElement>;

  private tooltipOverlay?: Overlay;

  /** Tracks which single overlay is open so opening one closes the others. */
  protected readonly menu = inject(MenuPanelService);
  statsTab: "details" | "history" | "chart" = "details";
  selectedObjective?: FullMatchObjective;
  hoveredObjective?: FullMatchObjective;
  private hoveredObjectiveId: string | null = null;

  private objectivesSource = new VectorSource();
  private spawnSource = new VectorSource();
  private headingLabels?: LabelOverlays;
  private sectorOwnership = new Map<number, string>();
  private liveMarkers?: OlLiveMarkersController;
  private latestRiExpiry = 0;

  activeMatch$ = this.store.select(selectActiveMatch);

  leftToolbar: ToolbarButton[] = [
    ...sharedLeftToolbarButtons(this.menu),
    {
      Tooltip: "Matches",
      Icon: "/assets/matches_icon.png",
      IconHover: "/assets/matches_hovered_icon.png",
      OnClick: () => this.menu.toggle("matches"),
      PanelId: "matches",
      Keybindings: ["Digit2"]
    },
    {
      Tooltip: "Match Stats",
      Icon: "/assets/stats_icon.png",
      IconHover: "/assets/stats_hovered_icon.png",
      OnClick: () => this.menu.toggle("score"),
      PanelId: "score",
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
  ) {
    super(ngZone, route, router, MISTS_MAP_CONFIG);
  }

  /** Escape closes whichever overlay is open (PrimeNG dialogs also self-close). */
  @HostListener("document:keydown.escape")
  onEscape() {
    this.menu.close();
  }

  ngOnInit() {
    this.store.dispatch(mistsActions.loadMatches());
    this.store.dispatch(liveMarkersActions.setActiveContinent({continentId: this.config.continentId}));

    // Match selection: explicit :id (match or legacy world id), else the last
    // viewed match. take(1): picking a match updates lastMatchId, and re-firing
    // here would double-dispatch setActiveMatch.
    this.route.params.pipe(
      map(params => params["id"] as string | undefined),
      combineLatestWith(this.store.select(s => s.settings.lastMatchId).pipe(take(1))),
      map(([id, lastMatchId]) => id ?? lastMatchId),
      takeUntil(this.unsubscribe$),
    ).subscribe(id => {
      if (id) {
        if (id.toString().includes("-")) {
          this.store.dispatch(mistsActions.setActiveMatch({matchId: id}));
        } else {
          this.store.dispatch(mistsActions.setActiveWorld({worldId: id}));
        }
      } else {
        this.menu.open("matches");
      }
    });

    this.initScreenSizeTracking();

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
    this.headingLabels?.destroy();
    this.destroyMap();
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
      group: ["World Map"],
      keepOnHideAll: true,
      zIndex: 0,
    });

    // Every static feature loaded once into one VectorSource. Sector colours
    // resolve per render via the forSourceLayer styles and the ownership closure,
    // so the layer.changed() on a match poll recolours them.
    const markerSource = new VectorSource();
    for (const def of createMistsStaticDefinitions(markerSource, id => this.sectorOwnership.get(id))) {
      const layer = this.registerLayer(def);
      if (def.id === "waypoints") {
        this.interactiveLayers.add(layer);
      }
    }
    this.http.get<MarkerFeatureJson[]>(markerFeaturesUrl(this.config)).pipe(take(1), catchError(() => of([])))
      .subscribe(raw => markerSource.addFeatures(buildMarkerFeatures(raw)));

    this.http.get<RegionLabelJson[]>("assets/data/region_labels_2_1.json").pipe(take(1), catchError(() => of([]))).subscribe(raw => {
      const entries = raw
        .filter(l => l.label_coordinates != null)
        .map(l => ({
          coord: gw2ToOl(l.label_coordinates!),
          heading: l.heading,
          subheading: l.subheading || undefined,
          kind: "map" as const,
        }));
      this.headingLabels = new LabelOverlays(olMap, [{
        entries,
        layer: this.mapLayers["mists_map_headings"].layer,
        minZoom: -Infinity, maxZoom: Infinity, opacityLevels: {},
        // Headings are overview chrome: fade away while zooming in.
        fadeOut: {start: 4.5, end: 5},
      }]);
    });

    const objectivesLayer = this.registerLayer({
      kind: "vector",
      id: "mists_objective",
      source: this.objectivesSource,
      style: objectiveStyle,
      friendlyName: "Objectives",
      icon: "/assets/keep_icon.png",
      state: LayerState.Enabled,
      group: ["Objectives"],
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
      group: ["World Map"],
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
      group: ["Objectives"],
      zIndex: 3,
    });

    // No match yet: show the neutral objective set.
    this.wvwService.getAllObjectives().pipe(
      take(1),
      takeUntil(this.unsubscribe$),
    ).subscribe(objectives => {
      if (this.objectivesSource.isEmpty()) {
        syncObjectiveFeatures(this.objectivesSource, this.spawnSource,
          objectives, EDGE_OF_THE_MISTS_MAP_ID);
      }
    });

    // Realtime: match poll drives objective properties + sector ownership.
    this.activeMatch$.pipe(
      filter((match): match is Match => match != null),
      takeUntil(this.unsubscribe$),
    ).subscribe(match => {
      this.sectorOwnership = new Map(
        match.objectives.map(obj => [obj.sector_id, obj.owner] as [number, string]));
      syncObjectiveFeatures(this.objectivesSource, this.spawnSource,
        match.objectives, EDGE_OF_THE_MISTS_MAP_ID);
      // Sector colours live in a style closure over sectorOwnership; force re-render.
      this.mapLayers["mists_sector_objective"]?.layer.changed();
      this.latestRiExpiry = match.objectives.reduce((latest, obj) =>
        obj.last_flipped ? Math.max(latest, new Date(obj.last_flipped).getTime() + RECENT_FLIP_WINDOW_MS) : latest, 0);
    });

    // RI countdowns tick once a second, but only invalidate the layer while
    // one is live (+2s grace so the final 0:01 render clears).
    interval(1000).pipe(takeUntil(this.unsubscribe$)).subscribe(() => {
      if (Date.now() < this.latestRiExpiry + 2_000) {
        this.mapLayers["mists_objective"]?.layer.changed();
      }
    });

    this.initUserLayers();

    this.tooltipOverlay = this.createTooltipOverlay(olMap, this.tooltipEl.nativeElement, [20, 0]);

    olMap.on("pointermove", e => this.onPointerMove(e));
    olMap.on("singleclick", e => this.onClick(e));

    this.handleChatLinkRoute(coord => this.panTo(coord, 6));
  }

  private onPointerMove(e: MapBrowserEvent) {
    if (e.dragging) {
      return;
    }
    const feature = this.featureAt(e.pixel);
    const tooltipEl = this.tooltipEl.nativeElement;

    const isPlain = feature && ["waypoint", "live", "user"].includes(feature.get("layer"));
    const objective = !isPlain ? feature?.get("objective_data") as FullMatchObjective | undefined : undefined;
    this.setHoveredObjective(objective);

    if (isPlain) {
      this.tooltipTextEl.nativeElement.innerText = tooltipFor(feature) ?? "";
    } else if (!objective && feature?.get("name") !== undefined) {
      this.tooltipTextEl.nativeElement.innerText = feature.get("name");
    } else {
      this.tooltipTextEl.nativeElement.innerText = "";
    }

    if (isPlain || objective || feature?.get("name") !== undefined) {
      tooltipEl.style.display = "block";
      this.tooltipOverlay?.setPosition(e.coordinate);
    } else {
      tooltipEl.style.display = "none";
      this.tooltipOverlay?.setPosition(undefined);
    }
    this.Map!.getTargetElement().style.cursor = feature ? "pointer" : "";
  }

  /** Pointermove runs outside the zone; only objective changes enter it. */
  private setHoveredObjective(objective?: FullMatchObjective) {
    const id = objective?.id ?? null;
    if (id === this.hoveredObjectiveId) {
      return;
    }
    this.hoveredObjectiveId = id;
    // Warm the dialog's images while hovering so they don't pop in on click.
    if (objective && objective.owner !== undefined) {
      this.wvwService.prefetchObjectiveAssets(objective);
    }
    this.ngZone.run(() => this.hoveredObjective = objective);
  }

  overviewMatchClicked(match: Match) {
    this.store.dispatch(mistsActions.setActiveMatch({matchId: match.id}));
    this.menu.close("matches");
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
        this.menu.open("objectiveDetails");
      });
      return;
    }

    const chatLink = feature.get("chat_link");
    if (!chatLink) {
      return;
    }
    const name = feature.get("name") || feature.get("tooltip") || chatLink;
    this.ngZone.run(() => this.copyToClipboard(chatLink, `Copied [${name}] to clipboard!`));
  }

}
