import {Component, OnInit} from '@angular/core';
import {
  FeatureGroup,
  latLng,
  LatLngBounds, LayerGroup,
  Map,
} from 'leaflet';
import * as L from "leaflet";
import {LayerService} from "../../services/layer.service";
import {ToastrService} from "ngx-toastr";
import {Match, MergedObjective, World, WvwService} from "../../services/wvw.service";
import {
  debounceTime,
  fromEvent, interval,
  map,
  Observable, switchMap, tap,
} from "rxjs";
import {BaseMap} from "../../lib/base-map";
import {CookieService} from "ngx-cookie";
import {Store} from "@ngrx/store";
import {mistsActions} from "../../state/mists/mists.action";
import {AppState} from "../../state/appState";
import {DialogService} from "primeng/dynamicdialog";

@Component({
  selector: 'mists-map',
  templateUrl: './mists-map.component.html',
  styleUrls: ['./mists-map.component.css'],
  providers: [DialogService]
})
export class MistsMapComponent extends BaseMap implements OnInit {
  private WvW_WORLD_KEY = "gw2.io_WvW_World" as const;
  private OBJECTIVE_LAYER = "mists_objective" as const;
  private HEADINGS_LAYER = "mists_headings" as const;

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
    private cookieService: CookieService,
    private readonly store: Store<AppState>,
    private dialogService: DialogService
  ) {
    super()

    this.worlds$ = wvwService.getAllWorlds();
    this.store.dispatch(mistsActions.loadMatches())

    fromEvent(document, "keydown")
      .subscribe(event => {
        const keyEvent = event as KeyboardEvent;

        switch (keyEvent.code) {
          case "Digit1":
            this.showScore = !this.showScore;
            break;
          case "Digit2":
            this.showMatches = !this.showMatches;
            break;
          case "Digit3":
            this.showSettings = !this.showSettings;
            break;
        }
      });
  }

  checkScreenSize = () => document.body.offsetWidth < 1024;
  smallScreen: boolean = this.checkScreenSize();

  ngOnInit(): void {
    fromEvent(window, 'resize')
      .pipe(
        debounceTime(200),
        map(this.checkScreenSize)
      ).subscribe((small) => this.smallScreen = small);
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
    this.registerLayer(this.HEADINGS_LAYER, {Layer: this.layerService.getMistsMapHeadings(leaflet), MinZoomLevel: 0, Hidden: false})

    if (this.cookieService.hasKey(this.WvW_WORLD_KEY)) {
      this.selectedWorld = this.cookieService.getObject(this.WvW_WORLD_KEY) as (World | undefined);
      if (this.selectedWorld) {
        this.store.dispatch(mistsActions.setActiveWorld({ worldId: this.selectedWorld.id }))
      } else {
        this.showSettings = true;
      }
    }

    this.layerService.getMistsObjectivesLayer(leaflet)
      .subscribe((layer) => this.updateLayer(this.OBJECTIVE_LAYER, layer))


    this.activeMatch$.pipe(
        map(activeMatch => {
          if (this.Map && activeMatch) {
            return this.layerService.createMistsObjectivesLayer(this.Map, activeMatch)
          }
          return new FeatureGroup();
        }),
        tap(layer => layer.on("click", (data: any) => this.openObjectiveDetails(data.data as MergedObjective)))
      ).subscribe(objectiveLayer => this.updateLayer(this.OBJECTIVE_LAYER, objectiveLayer))

    interval(20000)
      .pipe(
        switchMap(_ => this.store.select(state => state.mists.activeMatchId)),
        map(activeMatchId => {
          if (activeMatchId) {
            this.store.dispatch(mistsActions.updateMatch({ matchId: activeMatchId }))
          }
        }),
      ).subscribe(_ => _)
  }

  saveSettings(selectedWorld: World | undefined) {
    if (selectedWorld) {
      this.selectedWorld = selectedWorld;
      this.cookieService.put(this.WvW_WORLD_KEY, JSON.stringify(selectedWorld));

      this.store.dispatch(mistsActions.setActiveWorld({ worldId: selectedWorld.id }))
    }
  }

  overviewMatchClicked($event: Match) {
    if (this.Map) {
      this.layerService.getMistsObjectivesLayer(this.Map)
        .subscribe((layer) => this.updateLayer(this.OBJECTIVE_LAYER, layer))
    }

    this.store.dispatch(mistsActions.setActiveMatch({ matchId: $event.id }))
    this.showMatches = false;
  }

  openObjectiveDetails(objective: MergedObjective) {
    this.showObjectiveDetails = true;
    this.selectedObjective = objective;
  }
}
