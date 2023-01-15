import {Component, OnDestroy, OnInit} from '@angular/core';
import {
  latLng,
  LatLngBounds, LayerGroup,
  LeafletMouseEvent,
  Map,
} from 'leaflet';
import * as L from "leaflet";
import {LayerService} from "../../services/layer.service";
import {ToastrService} from "ngx-toastr";
import {Match, World, WvwService} from "../../services/wvw.service";
import {
  catchError,
  debounceTime,
  fromEvent,
  interval,
  map,
  mergeMap,
  Observable,
  of,
  Subject, Subscription,
  switchMap,
  tap
} from "rxjs";
import {BaseMap} from "../../lib/base-map";
import {CookieService} from "ngx-cookie";

@Component({
  selector: 'mists-map',
  templateUrl: './mists-map.component.html',
  styleUrls: ['./mists-map.component.css']
})
export class MistsMapComponent extends BaseMap implements OnInit, OnDestroy {
  private WvW_WORLD_KEY = "gw2.io_WvW_World" as const;
  title = 'Guild Wars 2 Mists Map';

  worlds$: Observable<World[]>;
  selectWorld$: Subject<string> = new Subject<string>();
  updateLayer$: Subscription;

  selectedWorld: World = { id: "1001", name: "Anvil Rock", population: "unknown"};
  selectedMatch: Match | undefined;
  loadingWorld: boolean = true;

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

  constructor(
    private layerService: LayerService,
    private wvwService: WvwService,
    private toastr: ToastrService,
    private cookieService: CookieService,
  ) {
    super()
    this.worlds$ = this.wvwService.getAllWorlds();

    fromEvent(document, "keydown")
      .subscribe(event => {
        const keyEvent = event as KeyboardEvent;

        switch (keyEvent.code) {
          case "Digit1":
            this.showScore = !this.showScore;
            break;
          case "Digit2":
            this.showSettings = !this.showSettings;
            break;
          case "Digit3":
            this.showMatches = !this.showMatches;
            break;
        }
      });

    this.updateLayer$ = interval(30000)
      .pipe(
        switchMap(_ => this.updateMatch(of(this.selectedWorld.id))),
        catchError((err) => {
          this.toastr.error(err, "Failed to update..");
          return of(null);
        })
      )
      .subscribe(layer => {
        if (layer) {
          this.updateLayer("match_objectives", layer)
        }
      });
  }

  checkScreenSize = () => document.body.offsetWidth < 1024;
  smallScreen: boolean = this.checkScreenSize();

  ngOnInit(): void {
    const screenSizeChanged$ = fromEvent(window, 'resize')
      .pipe(
        debounceTime(200),
        map(this.checkScreenSize)
      );

    screenSizeChanged$.subscribe((small) => this.smallScreen = small);
  }

  ngOnDestroy() {
    this.updateLayer$.unsubscribe()
  }

  onMapReady(leaflet: Map) {
    this.Map = leaflet;

    leaflet.options.crs = L.CRS.Simple;
    leaflet.setMaxBounds(new LatLngBounds(
      [-256, 0],
      [-32, 272]
    ));

    const mistsLayer = this.layerService.getMistsLayer()
    leaflet.addLayer(mistsLayer);

    this.registerLayer("match_objectives", {Layer: new LayerGroup(), MinZoomLevel: 0, Hidden: false});
    this.selectWorld$.pipe(
      tap(() => this.loadingWorld = true),
      mergeMap((worldId) =>
        this.layerService.getMistsObjectivesLayer(leaflet)
          .pipe(
            tap((layer) => this.updateLayer("match_objectives", layer) ),
            map((_: any) => worldId)
          )
      ),
      (worldId => this.updateMatch(worldId)),
      catchError((err) => {
        this.toastr.error(err, "Failed to update");
        return of(null);
      })
    ).subscribe(layer => {
      if (layer) {
        this.updateLayer("match_objectives", layer)
        this.loadingWorld = false;
      }
    })

    this.registerLayer("map_headings", {Layer: this.layerService.getMistsMapHeadings(leaflet), MinZoomLevel: 0, Hidden: false})

    if (this.cookieService.hasKey(this.WvW_WORLD_KEY)) {
      this.selectedWorld = this.cookieService.getObject(this.WvW_WORLD_KEY) as World;
      if (this.selectedWorld.id) {
        this.selectWorld$.next(this.selectedWorld.id);
      }
    }

  }

  onMapDoubleClick(event: LeafletMouseEvent) {
    if (this.Map) {
      this.toastr.info(this.Map.project(event.latlng, this.Map.getMaxZoom()).toString())
      this.toastr.warning(event.latlng.toString())
      this.toastr.error(this.Map.getZoom().toString())
    }
  }

  worldChanged(newWorld: World) {
    if (this.Map && newWorld.id != this.selectedWorld.id) {
      this.cookieService.put(this.WvW_WORLD_KEY, JSON.stringify(newWorld));
      this.selectWorld$.next(newWorld.id);
    }
  }

  updateMatch(worldId$: Observable<string>) {
    return worldId$.pipe(
      mergeMap((worldId) =>
        this.wvwService.getMatchDetailsByWorldId(worldId)
          .pipe(
            tap((match) => this.selectedMatch = match),
            map((_: any) => worldId)
          )
      ),
      switchMap(worldId => {
        if (this.Map) {
          return this.layerService.getMistsMatchObjectivesLayer(this.Map, worldId)
        }
        return of(new LayerGroup());
      })
    )
  }

  overviewMatchClicked(match: Match) {
    this.selectedMatch = match;
    this.showMatches = false;

    this.selectWorld$.next(match.worlds.red.toString());
  }
}
