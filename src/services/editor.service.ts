import {EventEmitter, Injectable} from '@angular/core';
import {Map, FeatureGroup, PointTuple, SVGOverlay, Point, svgOverlay, LatLngBounds} from "leaflet";
import {LabelService} from "./label.service";
import {ClipboardService} from "ngx-clipboard";
import {ToastrService} from "ngx-toastr";
import {LayerService} from "./layer.service";

export enum MarkerType {
  Unknown,
  Waypoint,
  Vista,
  Poi,
  Heart,
  SkillPoint,
  Mastery,
  Region,
  Map,
  Unlock
}

export interface MarkerMetadata {
  [key: string]: string | number | boolean;
}

interface Marker {
  id: number;
  coordinates: PointTuple,
  type: string,
  data: MarkerMetadata,
}

@Injectable({
  providedIn: 'root'
})
export class EditorService {
  private readonly markerLayer: FeatureGroup;
  private readonly markerEmitter: EventEmitter<FeatureGroup>;
  private markers: Marker[];

  private readonly textLayer: SVGSVGElement;
  private readonly textEmitter: EventEmitter<SVGOverlay>;
  private text: Marker[];

  constructor(private labelService: LabelService, private clipboard: ClipboardService, private toastr: ToastrService, private layerService: LayerService) {
    this.markerLayer = new FeatureGroup();
    this.textLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.textLayer.setAttribute('xmlns', "http://www.w3.org/2000/svg");
    this.textLayer.setAttribute('viewBox', `0 0 ${layerService.tyriaDimensions[0]} ${layerService.tyriaDimensions[1]}`);


    this.markerEmitter = new EventEmitter<FeatureGroup>();
    this.markers = [];

    this.textEmitter = new EventEmitter<SVGOverlay>();
    this.text = [];
  }

  getIcon(type: MarkerType, metadata: MarkerMetadata = {}): string {
    switch (type) {
      default:
      case MarkerType.Unknown:
        return "assets/poi.png";
      case MarkerType.Waypoint:
        return "assets/waypoint.png";
      case MarkerType.Vista:
        return "assets/vista.png";
      case MarkerType.Poi:
        return "assets/poi.png";
      case MarkerType.Heart:
        return "assets/hearts.png";
      case MarkerType.SkillPoint:
        return "assets/heropoint.png";
      case MarkerType.Mastery:
        if (!("type" in metadata)) {
          return "assets/core_mastery.png";
        }

        switch(metadata["type"]) {
          default:
          case "core":
            return "assets/core_mastery.png";
          case "hot":
            return "assets/hot_mastery.png";
          case "pof":
            return "assets/pof_mastery.png";
          case "ibs":
            return "assets/ibs_mastery.png";
          case "eod":
            return "assets/eod_mastery.png";
          case "soto":
            return "assets/soto_mastery.png";
        }
      case MarkerType.Unlock:
        if ("icon" in metadata && typeof(metadata["icon"]) === "string")
          return metadata["icon"]
        else
          return "assets/poi.png"
    }
  }

  public addMarker(leaflet: Map, type: MarkerType, coordinates: PointTuple, metadata: MarkerMetadata) {
    const icon = this.getIcon(type, metadata);
    const label = this.labelService.createCanvasMarker(leaflet, coordinates, icon);

    if (type == MarkerType.Waypoint || MarkerType.Poi) {
      if ("tooltip" in metadata && typeof(metadata["tooltip"]) === "string") {
        label.bindTooltip(metadata["tooltip"], { className: "tooltip", offset: new Point(25, 0) } )
      }
    }

    if ("chatLink" in metadata && typeof(metadata["chatLink"]) === "string") {
      label.on("click", (_: any) => {
        this.clipboard.copy(<string>metadata["chatLink"]);

        const msg = ("tooltip" in metadata && typeof(metadata["tooltip"]) === "string") ?
          `Copied [${metadata["tooltip"]}] to clipboard!` :
          `Copied ${metadata["chatLink"]} to clipboard!`;

        this.toastr.info(msg, "", {
          toastClass: "custom-toastr",
          positionClass: "toast-top-right"
        });
      }).on("dblclick", (_: any) => {
          const chatLink = encodeURIComponent(metadata["chatLink"])
          window.open(`https://wiki.guildwars2.com/wiki/?search=${chatLink}&ns0=1`)
      });
    }

    label.on("contextmenu", (_: any) => {
      this.markerLayer.removeLayer(label);
      this.markerEmitter.emit(this.markerLayer);
      this.markers = this.markers.filter(m => m.id !== Math.floor(coordinates[0] + coordinates[1]));
    });

    label.addTo(this.markerLayer);
    this.markerEmitter.emit(this.markerLayer);
    this.markers.push({
      id: Math.floor(coordinates[0] + coordinates[1]),
      coordinates: coordinates,
      type: MarkerType[type].toLowerCase(),
      data: metadata,
    });
  }

  public addText(leaflet: Map, type: MarkerType.Map | MarkerType.Region, coordinates: PointTuple, metadata: MarkerMetadata) {
    switch (type) {
      case MarkerType.Region:
        this.textLayer.innerHTML += `
          <text x="${coordinates[0]}" y="${coordinates[1]}" dominant-baseline="middle" text-anchor="middle" class="region-heading">${metadata["heading"]}</text>`
        break;
      case MarkerType.Map:
        this.textLayer.innerHTML += `
          <text x="${coordinates[0]}" y="${coordinates[1]}" dominant-baseline="middle" text-anchor="middle" class="map-heading">${metadata["heading"]}</text>
          <text x="${coordinates[0]}" y="${coordinates[1] + 180}" dominant-baseline="middle" text-anchor="middle" class="map-subheading">${metadata["subheading"] ?? ""}</text>`
    }

    this.textEmitter.emit(
      svgOverlay(
        this.textLayer,
        new LatLngBounds(
          leaflet.unproject([0, 0], leaflet.getMaxZoom()),
          leaflet.unproject([81920, 114688], leaflet.getMaxZoom())),
        {zIndex: 999}
      )
    );
    this.text.push({
      id: Math.floor(coordinates[0] + coordinates[1]),
      coordinates: coordinates,
      type: MarkerType[type].toLowerCase(),
      data: metadata,
    })
  }

  public getMarkerLayerEvents(): EventEmitter<FeatureGroup> {
    return this.markerEmitter;
  }

  public getTextLayerEvents(): EventEmitter<SVGOverlay> {
    return this.textEmitter;
  }

  public copyMarkerData() {
    this.clipboard.copy(
      JSON.stringify(this.markers, undefined, "\t")
    );
  }

  public copyTextData() {
    this.clipboard.copy(
      JSON.stringify(this.text, undefined, "\t")
    );
  }
}
