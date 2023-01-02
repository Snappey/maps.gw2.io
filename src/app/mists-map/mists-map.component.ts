import { Component, OnInit } from '@angular/core';
import {
  latLng,
  LatLngBounds, LayerGroup,
  LeafletMouseEvent,
  Map,
} from 'leaflet';
import * as L from "leaflet";
import {LayerService} from "../../services/layer.service";
import {ToastrService} from "ngx-toastr";
import {Match, Objective, Scores, Skirmish, World, WvwService} from "../../services/wvw.service";
import {
  catchError,
  debounceTime,
  fromEvent,
  interval,
  map,
  mergeMap,
  Observable,
  of,
  Subject,
  switchMap,
  tap
} from "rxjs";
import {BaseMap} from "../../lib/base-map";
import {CookieService} from "ngx-cookie";

interface ChartData {
  labels: string[]
  datasets: any[],
}

interface SkirmishSummary {
  Scores: Scores
  Tick: Scores
}

@Component({
  selector: 'mists-map',
  templateUrl: './mists-map.component.html',
  styleUrls: ['./mists-map.component.css']
})
export class MistsMapComponent extends BaseMap implements OnInit {
  private COOKIE_KEY = "gw2.io_WvW_World" as const;
  title = 'Guild Wars 2 Mists Map';

  worlds$: Observable<World[]>;
  selectWorld$: Subject<string> = new Subject<string>();

  selectedWorld: World = { id: "1001", name: "Anvil Rock", population: "unknown"};
  selectedMatch: Match | undefined;
  selectedMatchSkirmishSummary: SkirmishSummary | undefined;
  selectedMatchFightStats: ChartData = { labels: [], datasets: [] };
  selectedMatchSkirmishStats: ChartData = { labels: [], datasets: [] };
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

  fightChartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        display: true,
        position: "top"
      }
    },
    animation: {
      duration: 0
    }
  }

  skirmishChartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        display: false,
      }
    },
    interaction: {
      intersect: false,
      mode: 'index',
    },
    scales: {
      RunningTotal: {
        type: 'linear',
        position: 'right',
      },
      PerSkirmish: {
        type: 'linear',
        position: 'left',
      }
    },
    animation: {
      duration: 0
    }
  }

  showScore: boolean = false;
  showSettings: boolean = false;

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
        }
      });
  }

  // TODO: Move this to own file so we can use it elsewhere
  valueAscOrder = (a: any , b: any): number => {
    return a.value < b.value ? -1 : (b.value < a.value ? 1 : 0);
  }

  valueDescOrder = (a: any , b: any): number => {
    return a.value > b.value ? -1 : (b.value > a.value ? 1 : 0);
  }

  nullSort = (a: any, b:any) => {
    return 0;
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
        this.toastr.error(err, "Failed to update..");
        return of(null);
      })
    ).subscribe(layer => {
      if (layer) {
        this.updateLayer("match_objectives", layer)
        this.loadingWorld = false;
      }
    })

    interval(30000)
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

    this.registerLayer("map_headings", {Layer: this.layerService.getMistsMapHeadings(leaflet), MinZoomLevel: 0, Hidden: false})

    if (this.cookieService.hasKey(this.COOKIE_KEY)) {
      this.selectedWorld = this.cookieService.getObject(this.COOKIE_KEY) as World;
    }

    this.worldChanged(this.selectedWorld);
  }

  onMapDoubleClick(event: LeafletMouseEvent) {
    if (this.Map) {
      this.toastr.info(this.Map.project(event.latlng, this.Map.getMaxZoom()).toString())
      this.toastr.warning(event.latlng.toString())
      this.toastr.error(this.Map.getZoom().toString())
    }
  }

  worldChanged(newWorld: World) {
    if (this.Map) {
      this.cookieService.put(this.COOKIE_KEY, JSON.stringify(newWorld));
      this.selectWorld$.next(newWorld.id);
    }
  }

  calculateMatchPointsTick(match: Match, team: string): number {
    return match.maps.flat()
      .map(o => o.objectives).flat()
      .filter(o => o.owner.toLowerCase() === team.toLowerCase())
      .map(o => o.points_tick).reduce((total, cur) => total + cur);
  }

  updateMatch(worldId$: Observable<string>) {
    return worldId$.pipe(
      mergeMap((worldId) =>
        this.wvwService.getMatchDetailsByWorldId(worldId)
          .pipe(
            tap((match) => this.selectedMatch = match),
            tap(match => {
              if (match.skirmishes.length > 0) {
                this.selectedMatchSkirmishSummary = {
                  Scores: match.skirmishes[match.skirmishes.length - 1].scores,
                  Tick: {
                    red: this.calculateMatchPointsTick(match, "red"),
                    blue: this.calculateMatchPointsTick(match, "blue"),
                    green: this.calculateMatchPointsTick(match, "green")
                  }
                }
              }
            }),
            tap((match) => {
              const colours = ["#DC3939", "#24A2E7", "#43D071"]

              this.selectedMatchFightStats = {
                labels: [match.all_worlds_names.red.join(", "), match.all_worlds_names.blue.join(", "), match.all_worlds_names.green.join(", ")],
                datasets: [
                  {
                    label: "Kills",
                    data: Object.values(match.kills),
                    backgroundColor: colours
                  },
                  {
                    label: "Deaths",
                    data: Object.values(match.deaths),
                    backgroundColor: colours
                  },
                  {
                    label: "Ratio",
                    // @ts-ignore
                    data: Object.entries(match.kills).map(([team, kills]) => kills / match.deaths[team]),
                    backgroundColor: colours
                  }
                ]
              }

              const runningTotal = (arr: number[]) => arr.reduce((res: number[], cur, i) => {
                if (res.length > 0) {
                  res.push(res[i - 1] + cur);
                } else {
                  res.push(cur)
                }

                return res;
              }, []);

              // TODO: This will be a problem if worlds ever change (Alliances)
              const matchRegion = match.all_worlds.red.some(worldId => worldId.toString().startsWith("2")) ? "eu" : "us"
              const lastReset = this.wvwService.getLastResetTime(matchRegion);
              const skirmishInterval = 2;
              this.selectedMatchSkirmishStats = {
                labels: Object.keys(match.skirmishes).map((_, i) => {
                  if (lastReset) {
                    lastReset.setTime(lastReset.getTime() + (skirmishInterval * 60 * 60 * 1000));
                    return lastReset.toLocaleDateString() + " " + lastReset.toLocaleTimeString();
                  }
                  return _;
                }),
                datasets: [
                  {
                    type: 'line',
                    label: match.all_worlds_names.red.join(", "),
                    data: runningTotal(match.skirmishes.map(s => s.scores.red)),
                    borderColor: "#DC3939",
                    yAxisID: "RunningTotal"
                  },
                  {
                    type: 'line',
                    label: match.all_worlds_names.blue.join(", "),
                    data: runningTotal(match.skirmishes.map(s => s.scores.blue)),
                    borderColor: "#24A2E7",
                    yAxisID: "RunningTotal"
                  },
                  {
                    type: 'line',
                    label: match.all_worlds_names.green.join(", "),
                    data: runningTotal(match.skirmishes.map(s => s.scores.green)),
                    borderColor: "#43D071",
                    yAxisID: "RunningTotal"
                  },
                  {
                    type: 'bar',
                    label: match.all_worlds_names.red.join(", "),
                    data: match.skirmishes.map(s => s.scores.red),
                    backgroundColor: "#DC3939",
                    yAxisID: "PerSkirmish"
                  },
                  {
                    type: 'bar',
                    label: match.all_worlds_names.blue.join(", "),
                    data: match.skirmishes.map(s => s.scores.blue),
                    backgroundColor: "#24A2E7",
                    yAxisID: "PerSkirmish"
                  },
                  {
                    type: 'bar',
                    label: match.all_worlds_names.green.join(", "),
                    data: match.skirmishes.map(s => s.scores.green),
                    backgroundColor: "#43D071",
                    yAxisID: "PerSkirmish"
                  },
                ]
              }
            }),
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
}
