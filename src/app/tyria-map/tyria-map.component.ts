import {Component, isDevMode, NgZone, OnDestroy, OnInit} from '@angular/core';
import {ToastrService} from 'ngx-toastr';
import {
  debounceTime, first,
  fromEvent,
  map, Observable,
  Subject, take, takeUntil, tap
} from 'rxjs';
import {
  CRS,
  LatLng,
  latLng,
  LatLngBounds,
  LeafletEvent,
  LeafletMouseEvent,
  Map,
  PointTuple,
} from 'leaflet';
import "leaflet-contextmenu"
import {LayerService} from "../../services/layer.service";
import {EditorService, MarkerType} from "../../services/editor.service";
import {DialogService} from "primeng/dynamicdialog";
import {EditorModalComponent} from "./editor-modal/editor-modal.component";
import {ClipboardService} from "ngx-clipboard";
import {EventMap, Event, EventTimerService} from "../../services/event-timer.service";
import {SearchEntry, SearchService} from "../../services/search.service";
import {BaseMap} from "../../lib/base-map";
import {ActivatedRoute, Router} from "@angular/router";
import {MqttService} from "ngx-mqtt";
import {LabelService} from "../../services/label.service";
import {LiveMarkersService} from "../../services/live-markers.service";
import {liveMarkersActions} from "../../state/live-markers/live-markers.action";
import {Store} from "@ngrx/store";
import {AppState} from "../../state/appState";
import {ToolbarButton} from "../toolbar/toolbar.component";
import {AssetService} from "../../services/asset.service";
import {environment} from "../../environments/environment";

@Component({
  selector: 'tyria-map',
  templateUrl: './tyria-map.component.html',
  styleUrls: ['./tyria-map.component.css'],
  providers: [DialogService]
})
export class TyriaMapComponent extends BaseMap implements OnInit, OnDestroy {
  override CONTINENT_ID = 1 as const;
  FLOOR_ID = 1 as const

  showLayers: boolean = false;
  showEvents: boolean = false;
  showSettings: boolean = false;
  showAbout: boolean = false;

  private searchUnfocused: Subject<any> = new Subject<any>();
  showSearchResults: boolean = false;

  private unsubscribe$ = new Subject<void>();

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
      Tooltip: "World Bosses",
      Icon: "/assets/event_icon.png",
      IconHover: "/assets/event_hovered_icon.png",
      OnClick: () => this.showEvents = !this.showEvents,
      Keybindings: ["Digit2"]
    }
  ]

  rightToolbar: ToolbarButton[] = [
    {
      Tooltip: "WvW",
      Icon: "/assets/mists_icon.png",
      IconHover: "/assets/mists_hovered_icon.png",
      OnClick: () => this.router.navigate(["/wvw"])
    }
  ]

  constructor(
    private dialogService: DialogService,
    private toastr: ToastrService,

    private editorService: EditorService,
    private clipboardService: ClipboardService,
    private eventTimerService: EventTimerService,
    private searchService: SearchService,
    private store: Store<AppState>,
    private layerService: LayerService,
    ngZone: NgZone,
    mqttService: MqttService,
    labelService: LabelService,
    liveMarkerService: LiveMarkersService,
    router: Router,
    route: ActivatedRoute,
    assetService: AssetService,
  ) {
    super(ngZone, mqttService, labelService, liveMarkerService, assetService, route, router)

    // Setup Searchbox debouncing
    this.searchUnfocused.pipe(
      debounceTime(500),
      takeUntil(this.unsubscribe$)
    ).subscribe(() => {
      this.showSearchResults = false
    })

    fromEvent(window, 'resize')
      .pipe(
        debounceTime(200),
        map(this.checkScreenSize),
        takeUntil(this.unsubscribe$)
      ).subscribe((small) => this.smallScreen = small);
  }

  checkScreenSize = () => document.body.offsetWidth < 1024;
  smallScreen: boolean = document.body.offsetWidth < 1024;

  ngOnInit() {
    this.store.dispatch(liveMarkersActions.setActiveContinent({ continentId: this.CONTINENT_ID }))
  }

  ngOnDestroy() {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  upcomingEvents$: Observable<EventMap> =
    this.eventTimerService.getNextEventsTimer(8).pipe(
      tap((events) => {
        const layer = this.eventTimerService.createEventsLayer(this.Map, events);
        if (!this.hasLayer("events_layer")) {
          this.registerLayer("events_layer", {layer: layer, friendlyName: "World Bosses", icon: "/assets/event-boss.png", isHidden: false})
        } else {
          this.updateLayer("events_layer", layer);
        }
      }),
      takeUntil(this.unsubscribe$)
    );

  getCoords(latlng: LatLng): PointTuple {
    if (this.Map) {
      const coords = this.Map.project(latlng, this.Map.getMaxZoom());
      return [coords.x, coords.y] as PointTuple;
    }
    return [0,0];
  }

  //layersControls: LeafletControlLayersConfig = {baseLayers: {}, overlays: {}}
  options = {
    preferCanvas: true,
    maxNativeZoom: 9,
    maxZoom: 7,
    zoom: 3,
    zoomControl: false,
    center: latLng(-260, 365),
    contextmenu: isDevMode(),
    contextmenuWidth: 140,
    contextmenuItems: [{
      text: "Place Waypoint",
      icon: 'assets/waypoint.png',
      callback: (e: LeafletMouseEvent) =>
        this.placeMarker("Place Waypoint", MarkerType.Waypoint, this.getCoords(e.latlng))
    },
    {
      text: "Place PoI",
      icon: 'assets/poi.png',
      callback: (e: LeafletMouseEvent) =>
        this.placeMarker("Place Point of Interest", MarkerType.Poi, this.getCoords(e.latlng))
    },
    {
      text: "Place Vista",
      icon: "assets/vista.png",
      callback: (e: LeafletMouseEvent) =>
        this.placeMarker("Place Vista", MarkerType.Vista, this.getCoords(e.latlng))
    },
    {
      text: "Place Heart",
      icon: "assets/hearts.png",
      callback: (e: LeafletMouseEvent) =>
        this.placeMarker("Place Heart", MarkerType.Heart, this.getCoords(e.latlng))
    },
    {
      text: "Place Mastery",
      icon: "assets/core_mastery.png",
      callback: (e: LeafletMouseEvent) =>
        this.placeMarker("Place Mastery", MarkerType.Mastery, this.getCoords(e.latlng))
    },
    {
      text: "Place Hero Point",
      icon: "assets/heropoint.png",
      callback: (e: LeafletMouseEvent) =>
        this.placeMarker("Place Hero Point", MarkerType.SkillPoint, this.getCoords(e.latlng))
    },
    {
      text: "Place Unlock",
      callback: (e: LeafletMouseEvent) =>
        this.placeMarker("Place Unlock Point", MarkerType.Unlock, this.getCoords(e.latlng))
    },
    "-",
    {
      text: "Place Region Text",
      callback: (e: LeafletMouseEvent) =>
        this.placeMarker("Place Region Text", MarkerType.Region, this.getCoords(e.latlng))
    },
    {
      text: "Place Map Text",
      callback: (e: LeafletMouseEvent) =>
        this.placeMarker("Place Map Text", MarkerType.Map, this.getCoords(e.latlng))
    },
    "-",
    {
      text: "Copy Marker JSON",
      callback: (_: LeafletMouseEvent) =>
        this.editorService.copyMarkerData()
    },
    {
      text: "Copy Text JSON",
      callback: (_: LeafletMouseEvent) =>
        this.editorService.copyTextData()
    },
    "-",
    {
      text: "Centre On",
      icon: 'assets/zoom-in.png',
      callback: (e: LeafletMouseEvent) => this.Map?.panTo(e.latlng)
    },
      {
        text: "Copy Coordinates",
        callback: (e: LeafletMouseEvent) => this.clipboardService.copy(JSON.stringify(this.getCoords(e.latlng)))
      }]
  }

  friendlyLayerNames: {[key: string]: string} = {
    "region_labels": "Regions",
    "landmark": "Points of Interest",
    "waypoint": "Waypoints",
    "vista": "Vistas",
    "unlock": "Instanced Content",
  }

  placeMarker(header: string, type: MarkerType, coords: PointTuple) {
    if (this.Map) {
      this.dialogService.open(EditorModalComponent, {
        header: header,
        data: {
          type: type,
          coords: coords,
        }
      }).onClose.pipe(
        takeUntil(this.unsubscribe$),
      ).subscribe(res => {
        if (this.Map)
          if (type === MarkerType.Map || type === MarkerType.Region) {
            this.editorService.addText(this.Map, type, coords, res);
          } else {
            this.editorService.addMarker(this.Map, type, coords, res);
          }
      });
    }
  }

  onMapReady(leaflet: Map) {
    this.Map = leaflet;

    leaflet.options.crs = CRS.Simple;
    leaflet.options.maxBoundsViscosity = 1;
    leaflet.setMaxBounds(new LatLngBounds(
        leaflet.unproject([0, 0], leaflet.getMaxZoom()),
        leaflet.unproject(this.layerService.tyriaDimensions, leaflet.getMaxZoom())
    ));

    this.registerLayer("core", {
      layer: this.layerService.getTyriaTiles(),
      friendlyName: "Tyria",
      icon: "/assets/tyria_icon.png",
      isHidden: false,
    });

    this.layerService.getWaypointLayer(leaflet, this.CONTINENT_ID, this.FLOOR_ID).pipe(
      take(1)
    ).subscribe(layer => this.registerLayer("waypoints", { layer: layer, minZoomLevel: 5, friendlyName: "Waypoints", icon: "/assets/waypoint.png", isHidden: false}))

    this.layerService.getLandmarkLayer(leaflet, this.CONTINENT_ID, this.FLOOR_ID).pipe(
      take(1)
    ).subscribe(layer => this.registerLayer("landmarks", { layer: layer, minZoomLevel: 6, friendlyName: "Points of Interest", icon: "/assets/poi.png", isHidden: false}))

    this.layerService.getVistaLayer(leaflet, this.CONTINENT_ID, this.FLOOR_ID).pipe(
      take(1)
    ).subscribe(layer => this.registerLayer("vista", { layer: layer, minZoomLevel: 6, friendlyName: "Vistas", icon: "/assets/vista.png", isHidden: false }))

    this.layerService.getUnlockLayer(leaflet, this.CONTINENT_ID, this.FLOOR_ID).pipe(
      take(1)
    ).subscribe(layer => this.registerLayer("unlocks", { layer: layer, minZoomLevel: 4, friendlyName: "Instanced Content", icon: "/assets/commander_blue.png", isHidden: false }))

    this.layerService.getHeartLayer(leaflet, this.CONTINENT_ID, this.FLOOR_ID).pipe(
      take(1)
    ).subscribe(layer => this.registerLayer("heart_labels", {layer: layer, minZoomLevel: 6, friendlyName: "Hearts", icon: "/assets/hearts.png", isHidden: false}))

    this.layerService.getSkillPointLayer(leaflet, this.CONTINENT_ID, this.FLOOR_ID).pipe(
      take(1)
    ).subscribe(layer => this.registerLayer("heropoint_labels", {layer: layer, minZoomLevel: 6, friendlyName: "Hero Points", icon: "/assets/heropoint.png", isHidden: false}))

    this.layerService.getMasteryPointLayer(leaflet, this.CONTINENT_ID, this.FLOOR_ID).pipe(
      take(1)
    ).subscribe(layer => this.registerLayer("masteries_labels", {layer: layer, minZoomLevel: 6, friendlyName: "Masteries", icon: "/assets/core_mastery.png", isHidden: false}))

    this.layerService.getRegionLabels(leaflet, this.CONTINENT_ID, this.FLOOR_ID).pipe(
      take(1)
    ).subscribe(layer => {
        this.registerLayer("region_labels",
          {layer: layer, maxZoomLevel: 5, minZoomLevel: 2, friendlyName: "Region Headings", icon: "/assets/list_icon.png", isHidden: false, opacityLevels: {5: .2, 4: .6}})
        layer.bringToFront();
      });

    this.layerService.getMapLabels(leaflet, this.CONTINENT_ID, this.FLOOR_ID).pipe(
      take(1)
    ).subscribe(layer => {
        this.registerLayer("map_labels",
          {layer: layer, maxZoomLevel: 5, minZoomLevel: 3, friendlyName: "Map Headings", icon: "/assets/list_icon.png", isHidden: false, opacityLevels: {5: .7}})
        layer.bringToFront();
      });

    this.layerService.getAdventuresLayer(leaflet).pipe(
      take(1)
    ).subscribe(layer => this.registerLayer("adventure_labels", {layer: layer, minZoomLevel: 6, friendlyName: "Adventures", icon: "/assets/adventure_icon.png", isHidden: false}))

    this.layerService.getSectorTextLayer(leaflet, this.CONTINENT_ID, this.FLOOR_ID).pipe(
      take(1)
    ).subscribe(layer => this.registerLayer("sector_headings", { layer: layer, minZoomLevel: 7, friendlyName: "Sector Headings", icon: "/assets/list_icon.png", isHidden: false }))

    this.layerService.getCityMarkersLayer(leaflet).pipe(
      take(1)
    ).subscribe(layer => this.registerLayer("city_markers", {layer: layer, minZoomLevel: 7, friendlyName: "City Markers", icon: "/assets/portal_icon.png", isHidden: false}))

    // this.layerService.getSectorLayer(leaflet, this.CONTINENT_ID, this.FLOOR_ID).pipe(
    //   tap(layer => console.log(layer)),
    //   take(1)
    // ).subscribe(layer => this.registerLayer("sector_polygons", { layer: layer, minZoomLevel: 7, friendlyName: "Sector Outlines", isEnabled: false, isHidden: false }))

    if (!environment.production) {
      this.editorService.getMarkerLayerEvents().pipe(
          takeUntil(this.unsubscribe$)
      ).subscribe(layer => {
        if (!this.hasLayer("editable_markers")) {
          this.registerLayer("editable_markers", {layer: layer, minZoomLevel: 3, isHidden: false})
        } else {
          this.updateLayer("editable_markers", layer);
        }
      });

      this.editorService.getTextLayerEvents().pipe(
          takeUntil(this.unsubscribe$)
      ).subscribe(layer => {
        if (!this.hasLayer("editable_text")) {
          this.registerLayer("editable_text", {layer: layer, maxZoomLevel: 6, minZoomLevel: 2, isHidden: false, opacityLevels: {5: .8, 6: .5}})
        } else {
          this.updateLayer("editable_text", layer);
        }
      });
    }

    this.route.params.pipe(
      map(params=> params["chat_link"]),
      takeUntil(this.unsubscribe$)
    ).subscribe((chatLink: string) => {
      if (chatLink) {

        // TODO: Sort out search state, so we can link directly to places in the world without a weird race condition waiting for data to be filled
      }
    })

    super.onMapInitialised(leaflet);
  }

  onMapDoubleClick(_: LeafletMouseEvent) {
  }

  onMapZoomFinished(_: LeafletEvent) {
    if (this.Map) {
      const zoomLevel = this.Map.getZoom();

      this.updateLayerVisibility(zoomLevel);
    }
  }

  panToEvent(event: Event) {
    if (this.Map) {
      const latLng = this.Map.unproject(event.coordinates, this.Map.getMaxZoom());
      this.Map.setView(latLng, 5);

      this.clipboardService.copy(event.chatLink);
      this.toastr.info("Copied closest waypoint to clipboard!", event.name, {
        toastClass: "custom-toastr",
        positionClass: "toast-top-right"
      });

      this.showEvents = false;
    }
  }

  panToSearchResult($event: SearchEntry) {
    this.panTo($event.coords, 7);
  }

  closeSearchResults() {
    this.searchUnfocused.next(0);
  }
}
