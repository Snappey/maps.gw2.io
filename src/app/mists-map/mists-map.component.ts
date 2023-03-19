import {Component, NgZone, OnDestroy, OnInit} from '@angular/core';
import {
  FeatureGroup,
  latLng,
  LatLngBounds, LayerGroup, LeafletEvent,
  Map,
} from 'leaflet';
import * as L from "leaflet";
import {LayerService} from "../../services/layer.service";
import {ToastrService} from "ngx-toastr";
import {Match, MergedObjective, World, WvwService} from "../../services/wvw.service";
import {
  combineLatestWith,
  debounceTime, filter, first,
  fromEvent, interval,
  map,
  Observable, Subject, switchMap, take, takeUntil, tap,
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

@Component({
  selector: 'mists-map',
  templateUrl: './mists-map.component.html',
  styleUrls: ['./mists-map.component.css'],
  providers: [DialogService]
})
export class MistsMapComponent extends BaseMap implements OnInit, OnDestroy {
  private OBJECTIVE_LAYER = "mists_objective" as const;
  private OBJECTIVE_SECTOR_LAYER = "mists_sector_objective" as const;
  private HEADINGS_LAYER = "mists_headings" as const;
  private CONTINENT_ID = 2 as const;
  private FLOOR_ID = 1 as const;

  worlds$: Observable<World[]>;
  selectedWorld: World | undefined;
  selectedObjective: MergedObjective | undefined;

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
  showObjectiveDetails: boolean = false;

  constructor(
    private layerService: LayerService,
    private wvwService: WvwService,
    private toastr: ToastrService,
    private readonly store: Store<AppState>,
    private route: ActivatedRoute,
    ngZone: NgZone,
    mqttService: MqttService,
    labelService: LabelService,
    liveMarkerService: LiveMarkersService,
    router: Router
  ) {
    super(ngZone, mqttService, labelService, liveMarkerService, router)

    this.worlds$ = wvwService.getAllWorlds();
    this.store.dispatch(mistsActions.loadMatches())

    fromEvent(document, "keydown").pipe(
      takeUntil(this.unsubscribe$)
    ).subscribe(event => {
      const keyEvent = event as KeyboardEvent;

      switch (keyEvent.code) {
        case "Digit1":
          this.showScore = !this.showScore;
          break;
        case "Digit2":
          this.showMatches = !this.showMatches;
          break;
      }
    });

    fromEvent(window, 'resize')
      .pipe(
        debounceTime(200),
        map(this.checkScreenSize),
        takeUntil(this.unsubscribe$),
      ).subscribe((small) => this.smallScreen = small);
  }

  checkScreenSize = () => document.body.offsetWidth < 1024;
  smallScreen: boolean = this.checkScreenSize();

  unsubscribe$ = new Subject<void>();
  ngOnInit(): void {
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

    this.layerService.getMistsLayer().addTo(leaflet)
    this.registerLayer(this.OBJECTIVE_LAYER, {Layer: new LayerGroup(), MinZoomLevel: 0, Hidden: false});
    this.registerLayer(this.OBJECTIVE_SECTOR_LAYER, {Layer: new FeatureGroup(), MinZoomLevel: 0, Hidden: false})
    this.registerLayer(this.HEADINGS_LAYER, {Layer: this.layerService.getMistsMapHeadings(leaflet), MinZoomLevel: 0, Hidden: false})

    this.layerService.getMistsObjectivesLayer(leaflet).pipe(
      take(1),
    ).subscribe((layer) => this.updateLayer(this.OBJECTIVE_LAYER, layer))

    this.activeMatch$.pipe(
        map(activeMatch => {
          if (this.Map && activeMatch) {
            return this.layerService.createMistsObjectivesLayer(this.Map, activeMatch)
          }
          return new FeatureGroup();
        }),
        tap(layer => layer.on("click", (data: any) => this.openObjectiveDetails(data.data as MergedObjective))),
        takeUntil(this.unsubscribe$)
      ).subscribe(objectiveLayer => this.updateLayer(this.OBJECTIVE_LAYER, objectiveLayer))

    this.activeMatch$.pipe(
      filter(activeMatch => !!this.Map && !!activeMatch),
      switchMap(activeMatch => this.layerService.createMistsObjectivesSectorLayer(this.Map, activeMatch!)),
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
    ).subscribe(layer => this.registerLayer("waypoints", { Layer: layer, MinZoomLevel: 5, Hidden: false}))

    super.onMapInitialised(leaflet);
  }

  overviewMatchClicked($event: Match) {
    if (this.Map) {
      this.layerService.getMistsObjectivesLayer(this.Map).pipe(
        first()
      ).subscribe((layer) => this.updateLayer(this.OBJECTIVE_LAYER, layer))
    }

    this.store.dispatch(mistsActions.setActiveMatch({ matchId: $event.id }))
    this.showMatches = false;
  }

  openObjectiveDetails(objective: MergedObjective) {
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
