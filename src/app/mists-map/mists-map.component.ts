import {Component, NgZone, OnDestroy, OnInit} from '@angular/core';
import * as L from 'leaflet';
import {FeatureGroup, latLng, LatLngBounds, LayerGroup, LeafletEvent, Map,} from 'leaflet';
import {LayerService} from "../../services/layer.service";
import {ToastrService} from "ngx-toastr";
import {FullMatchObjective, Match, World, WvwService} from "../../services/wvw.service";
import {
  combineLatestWith,
  debounceTime,
  filter,
  first,
  fromEvent,
  interval,
  map,
  Observable,
  of,
  Subject,
  switchMap,
  take,
  takeUntil,
  tap,
} from "rxjs";
import {BaseMap} from "../../lib/base-map";
import {Store} from "@ngrx/store";
import {mistsActions} from "../../state/mists/mists.action";
import {AppState} from "../../state/appState";
import {DialogService} from "primeng/dynamicdialog";
import {ActivatedRoute, Router} from "@angular/router";
import {MqttService} from "ngx-mqtt";
import {LabelService} from "../../services/label.service";
import {LiveMarkersService} from "../../services/live-markers.service";
import {liveMarkersActions} from "../../state/live-markers/live-markers.action";
import {ToolbarButton} from "../toolbar/toolbar.component";

@Component({
  selector: 'mists-map',
  templateUrl: './mists-map.component.html',
  styleUrls: ['./mists-map.component.css'],
  providers: [DialogService]
})
export class MistsMapComponent extends BaseMap implements OnInit, OnDestroy {
  OBJECTIVE_LAYER = "mists_objective" as const;
  OBJECTIVE_SPAWN_HEADINGS_LAYER = "mists_spawn_headings" as const;
  OBJECTIVE_SECTOR_LAYER = "mists_sector_objective" as const;
  MAP_HEADINGS_LAYER = "mists_map_headings" as const;
  override CONTINENT_ID = 2 as const;
  FLOOR_ID = 1 as const;

  worlds$: Observable<World[]> = this.wvwService.getAllWorlds();
  selectedWorld: World | undefined;
  selectedObjective: FullMatchObjective | undefined;

  activeMatch$ = this.store.select(state => state.mists.activeMatch);

  options = {
    preferCanvas: true,
    maxZoom: 6,
    minZoom: 3.25,
    zoomSnap: 0.25,
    zoom: 4,
    zoomControl: false,
    center: latLng(-65, 50),
    contextmenu: false,
  }

  showScore: boolean = false;
  showSettings: boolean = false;
  showMatches: boolean = false;
  showLayers: boolean = false;
  showObjectiveDetails: boolean = false;
  showAbout: boolean = false;

  unsubscribe$ = new Subject<void>();

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
  ]

  rightToolbar: ToolbarButton[] = [
    {
      Tooltip: "Tyria",
      Icon: "/assets/tyria_icon.png",
      IconHover: "/assets/tyria_hovered_icon.png",
      OnClick: () => this.router.navigate(["/tyria"])
    }
  ]

  constructor(
    private wvwService: WvwService,
    toastr: ToastrService,

    private readonly store: Store<AppState>,
    layerService: LayerService,
    route: ActivatedRoute,
    ngZone: NgZone,
    mqttService: MqttService,
    labelService: LabelService,
    liveMarkerService: LiveMarkersService,
    router: Router
  ) {
    super(ngZone, mqttService, labelService, liveMarkerService, toastr, layerService, route, router)

    fromEvent(window, 'resize')
      .pipe(
        debounceTime(200),
        map(this.checkScreenSize),
        takeUntil(this.unsubscribe$),
      ).subscribe((small) => this.smallScreen = small);
  }

  checkScreenSize = () => document.body.offsetWidth < 1024;
  smallScreen: boolean = this.checkScreenSize();

  ngOnInit(): void {
    this.store.dispatch(mistsActions.loadMatches())
    this.store.dispatch(liveMarkersActions.setActiveContinent({ continentId: this.CONTINENT_ID }))

    this.route.params.pipe(
      map(params=> params["id"] as string),
      combineLatestWith(this.store.select(s => s.settings.homeWorld)),
      map(([id, homeWorldId]) => {
        if (id) {
          return id
        }

        if (homeWorldId) {
          return homeWorldId;
        }

        return undefined
      }),
      takeUntil(this.unsubscribe$)
    ).subscribe((id: string | undefined) => {
      if (id) {
        id.toString().includes("-") ?
          this.store.dispatch(mistsActions.setActiveMatch({ matchId: id })) :
          this.store.dispatch(mistsActions.setActiveWorld({ worldId: id }))
      } else {
        this.toastr.warning("Failed to find your home world, check your settings.", "Missing Home World", { timeOut: 10000, toastClass: "custom-toastr", positionClass: "toast-top-right" });
        this.showMatches = true;
      }
    })
  }

  ngOnDestroy() {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  onMapReady(leaflet: Map) {
    this.Map = leaflet;

    leaflet.options.crs = L.CRS.Simple;
    leaflet.options.maxBoundsViscosity = 1;
    leaflet.setMaxBounds(new LatLngBounds(
      [-256, 0],
      [-48, 256]
    ));

    this.layerService.getMistsTiles().addTo(leaflet)
    this.registerLayer(this.OBJECTIVE_LAYER, {layer: new LayerGroup(), minZoomLevel: 0, friendlyName: "Objectives", icon: "/assets/keep_icon.png", isHidden: false});
    this.registerLayer(this.OBJECTIVE_SECTOR_LAYER, {layer: new FeatureGroup(), minZoomLevel: 0, friendlyName: "Objective Sectors", icon: "/assets/sector_icon.png", isHidden: false});
    this.registerLayer(this.OBJECTIVE_SPAWN_HEADINGS_LAYER, { layer: new FeatureGroup(), minZoomLevel: 0, friendlyName: "Spawn Headings", icon: "/assets/list_icon.png", isHidden: false });

    this.layerService.getMistsHeadings(leaflet).pipe(
      take(1)
    ).subscribe(layer =>
      this.registerLayer(this.MAP_HEADINGS_LAYER, {layer: layer, minZoomLevel: 0, friendlyName: "Map Headings", icon: "/assets/list_icon.png", isHidden: false})
    )

    this.layerService.getMistsObjectives(leaflet).pipe(
      take(1),
    ).subscribe((layer) => this.updateLayer(this.OBJECTIVE_LAYER, layer))

    this.activeMatch$.pipe(
        switchMap(activeMatch => activeMatch ?
          this.layerService.createMistsMatchObjectives(leaflet, activeMatch) :
          of(new FeatureGroup())
        ),
        tap(layer => layer.on("click", (objective: any) => this.openObjectiveDetails(objective.data as FullMatchObjective))),
        takeUntil(this.unsubscribe$)
      ).subscribe(objectiveLayer => this.updateLayer(this.OBJECTIVE_LAYER, objectiveLayer))

    this.activeMatch$.pipe(
      switchMap(activeMatch => activeMatch ?
          this.layerService.createMistsMatchSpawnHeadings(leaflet, activeMatch) :
          of(new FeatureGroup())
      ),
      takeUntil(this.unsubscribe$)
    ).subscribe(spawnHeadingsLayer => this.updateLayer(this.OBJECTIVE_SPAWN_HEADINGS_LAYER, spawnHeadingsLayer))

    this.activeMatch$.pipe(
      filter(activeMatch => !!this.Map && !!activeMatch),
      switchMap(activeMatch => this.layerService.createMistsObjectivesSectors(this.Map, activeMatch!)),
      takeUntil(this.unsubscribe$)
    ).subscribe(objectiveSectorLayer => this.updateLayer(this.OBJECTIVE_SECTOR_LAYER, objectiveSectorLayer))

    interval(20000)
      .pipe(
        switchMap(_ => this.store.select(state => state.mists.activeMatchId)),
        map(activeMatchId => {
          if (activeMatchId) {
            this.store.dispatch(mistsActions.updateMatch({ matchId: activeMatchId }))
          }
        }),
        takeUntil(this.unsubscribe$)
      ).subscribe(_ => _)


    this.layerService.getWaypointLayer(leaflet, this.CONTINENT_ID, this.FLOOR_ID).pipe(
      take(1)
    ).subscribe(layer => this.registerLayer("waypoints", { layer: layer, minZoomLevel: 5, friendlyName: "Waypoints", icon: "/assets/waypoint.png", isHidden: false}))

    super.onMapInitialised(leaflet);
  }

  overviewMatchClicked($event: Match) {
    if (this.Map) {
      this.layerService.getMistsObjectives(this.Map).pipe(
        first()
      ).subscribe((layer) => this.updateLayer(this.OBJECTIVE_LAYER, layer))
    }

    this.store.dispatch(mistsActions.setActiveMatch({ matchId: $event.id }))
    this.showMatches = false;
  }

  openObjectiveDetails(objective: FullMatchObjective) {
    this.showObjectiveDetails = true;
    this.selectedObjective = objective;
  }

  onMapZoomFinished(_: LeafletEvent) {
    if (this.Map) {
      const zoomLevel = this.Map.getZoom();

      this.updateLayerVisibility(zoomLevel);
    }
  }
}
