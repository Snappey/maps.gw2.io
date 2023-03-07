import {Component, OnDestroy, OnInit} from '@angular/core';
import {ToastrService} from 'ngx-toastr';
import {
  combineLatest,
  debounceTime, first,
  fromEvent,
  map,
  Subject, Subscription, takeUntil
} from 'rxjs';
import {
  CRS,
  LatLng,
  latLng,
  LatLngBounds,
  Layer,
  LeafletEvent,
  LeafletMouseEvent,
  Map,
  PointTuple, Polyline,
  TileLayer
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

@Component({
  selector: 'tyria-map',
  templateUrl: './tyria-map.component.html',
  styleUrls: ['./tyria-map.component.css'],
  providers: [DialogService]
})
export class TyriaMapComponent extends BaseMap implements OnInit, OnDestroy {
  private CONTINENT_ID = 1 as const;

  smallScreen: boolean = false;
  showEvents: boolean = false;
  showDailies: boolean = false;
  showSettings: boolean = false;

  upcomingEvents: EventMap = {};

  private searchUnfocused: Subject<any> = new Subject<any>();
  showSearchResults: boolean = false;

  private unsubscribe$ = new Subject<void>();

  constructor(
    private dialogService: DialogService,
    private toastr: ToastrService,
    private layerService: LayerService,
    private editorService: EditorService,
    private clipboardService: ClipboardService,
    private eventTimerService: EventTimerService,
    private route: ActivatedRoute,
    private searchService: SearchService,
    private store: Store<AppState>,
    mqttService: MqttService,
    labelService: LabelService,
    liveMarkerService: LiveMarkersService,
    router: Router,
  ) {
    super(mqttService, labelService, liveMarkerService, router)
    // Setup Shortcuts
    fromEvent(document, "keydown").pipe(
      takeUntil(this.unsubscribe$)
    ).subscribe(event => {
      const keyEvent = event as KeyboardEvent;

      switch (keyEvent.code) {
        case "Digit1":
          this.showEvents = !this.showEvents;
          break;
        case "Digit2":
          this.showDailies = !this.showDailies;
          break;
      }
    });

    // Setup Searchbox debouncing
    this.searchUnfocused.pipe(
      debounceTime(500),
      takeUntil(this.unsubscribe$)
    ).subscribe(() => {
      this.showSearchResults = false
    })

    this.eventTimerService.getNextEventsTimer(5).pipe(
      takeUntil(this.unsubscribe$)
    ).subscribe((events) => {
      if (this.Map) {
        const layer = this.eventTimerService.createEventsLayer(this.Map, events);
        if (!this.hasLayer("events_layer")) {
          this.registerLayer("events_layer", {Layer: layer, Hidden: false})
        } else {
          this.updateLayer("events_layer", layer);
        }

        this.upcomingEvents = events;
      }
    });
  }

  ngOnInit() {
    this.store.dispatch(liveMarkersActions.setActiveContinent({ continentId: this.CONTINENT_ID }))

    const checkScreenSize = () => document.body.offsetWidth < 1024;
    fromEvent(window, 'resize')
      .pipe(
        debounceTime(200),
        map(checkScreenSize),
        takeUntil(this.unsubscribe$)
      ).subscribe((small) => this.smallScreen = small);
  }

  ngOnDestroy() {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  getCoords(latlng: LatLng): PointTuple {
    if (this.Map) {
      const coords = this.Map.project(latlng, this.Map.getMaxZoom());
      return [coords.x, coords.y] as PointTuple;
    }
    return [0,0] as PointTuple;
  }

  //layersControls: LeafletControlLayersConfig = {baseLayers: {}, overlays: {}}
  options = {
    preferCanvas: true,
    maxNativeZoom: 9,
    maxZoom: 7,
    zoom: 3,
    zoomControl: false,
    center: latLng(-260, 365),
    contextmenu: false,
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
      callback: (e: LeafletMouseEvent) =>
        this.editorService.copyMarkerData()
    },
    {
      text: "Copy Text JSON",
      callback: (e: LeafletMouseEvent) =>
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
      Layer: this.layerService.getTyriaLayer(),
      Hidden: false,
    });

    this.layerService.getPoiLayer(leaflet).pipe(
      first()
    ).subscribe(layers => {
      for (let layersKey in layers) {
        let layer = layers[layersKey];
        switch (layersKey) {
          case "waypoint":
            this.registerLayer(layersKey, { Layer: layer, MinZoomLevel: 5, Hidden: false})
            break;
          case "unlock":
            this.registerLayer(layersKey, { Layer: layer, MinZoomLevel: 3, Hidden: false})
            break;
          default:
            this.registerLayer(layersKey, { Layer: layer, MinZoomLevel: 6, Hidden: false})
        }

      }
    });

    this.layerService.getHeartLayer(leaflet).pipe(
      first()
    ).subscribe(layer => this.registerLayer("heart_labels", {Layer: layer, MinZoomLevel: 6, Hidden: false}))

    this.layerService.getSkillPointLayer(leaflet).pipe(
      first()
    ).subscribe(layer => this.registerLayer("heropoint_labels", {Layer: layer, MinZoomLevel: 6, Hidden: false}))

    this.layerService.getMasteryPointLayer(leaflet).pipe(
      first()
    ).subscribe(layer => this.registerLayer("masteries_labels", {Layer: layer, MinZoomLevel: 6, Hidden: false}))

    this.layerService.getRegionLayer(leaflet).pipe(
      first()
    ).subscribe(layer => {
        this.registerLayer("region_labels",
          {Layer: layer, MaxZoomLevel: 5, MinZoomLevel: 2, Hidden: false, OpacityLevels: {5: .2, 4: .6}})
        layer.bringToFront();
      });

    this.layerService.getMapLayer(leaflet).pipe(
      first()
    ).subscribe(layer => {
        this.registerLayer("map_labels",
          {Layer: layer, MaxZoomLevel: 6, MinZoomLevel: 2, Hidden: false, OpacityLevels: {5: .8, 6: .5}})
        layer.bringToFront();
      });

    this.editorService.getMarkerLayerEvents().pipe(
      takeUntil(this.unsubscribe$)
    ).subscribe(layer => {
        if (!this.hasLayer("editable_markers")) {
          this.registerLayer("editable_markers", {Layer: layer, MinZoomLevel: 3, Hidden: false})
        } else {
          this.updateLayer("editable_markers", layer);
        }
      });

    this.editorService.getTextLayerEvents().pipe(
      takeUntil(this.unsubscribe$)
    ).subscribe(layer => {
      if (!this.hasLayer("editable_text")) {
        this.registerLayer("editable_text", {Layer: layer, MaxZoomLevel: 6, MinZoomLevel: 2, Hidden: false, OpacityLevels: {5: .8, 6: .5}})
      } else {
        this.updateLayer("editable_text", layer);
      }
    });

    this.route.params.pipe(
      map(params=> params["chat_link"] as string),
      takeUntil(this.unsubscribe$)
    ).subscribe(chatLink => {
      if (chatLink) {
        // TODO: Sort out search state, so we can link directly to places in the world without a weird race condition waiting for data to be filled
      }
    })

    this.setupDrawing();

    super.onMapInitialised(leaflet);
  }

  onMapDoubleClick(event: LeafletMouseEvent) {
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
