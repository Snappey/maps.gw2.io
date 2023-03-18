import {Injectable} from '@angular/core';
import {HttpClient} from "@angular/common/http";
import {Observable, map, tap, of, iif, combineLatestWith, from, withLatestFrom, switchMap} from "rxjs";
import {
  Canvas,
  FeatureGroup,
  LatLngBounds, Layer,
  LayerGroup, LeafletEvent, LeafletMouseEvent,
  Map, Marker, Point,
  PointExpression,
  PointTuple, Polygon, svg,
  svgOverlay,
  SVGOverlay,
  tileLayer,
  TileLayer
} from "leaflet";
import {ClipboardService} from "ngx-clipboard";
import {ToastrService} from "ngx-toastr";
import {CanvasIcon, LabelService} from "./label.service";
import {SearchService} from "./search.service";
import {MergedObjective, WvwService, Match} from "./wvw.service";
import {Guild, GuildService} from "./guild.service";
import moment from "moment";

export interface GroupedLayer {
  [id: string]: FeatureGroup;
}

interface GroupedLabels<T> {
  [map: string]: T;
}

interface RegionLabel {
  type: string;
  label_coordinates: number[];
  coordinates: number[][];
  heading: string;
  subheading: string;
}

interface MarkerLabel {
  id: number;
  coordinates: PointTuple,
  type: string;
  data: any;
  continent: string;
  map: string;
}

@Injectable({
  providedIn: 'root'
})
export class LayerService {
  public tyriaDimensions: PointTuple = [81920, 114688];
  public mistsDimensions: PointTuple = [16384, 16384];

  constructor(
    private http: HttpClient,
    private labelService: LabelService,
    private clipboard: ClipboardService,
    private toastr: ToastrService,
    private searchService: SearchService,
    private wvwService: WvwService,
    private guildService: GuildService,
  ) {
  }

  getTyriaLayer(): TileLayer {
    return tileLayer('https://tiles.gw2.io/1/1/{z}/{x}/{y}.jpg', {
      maxNativeZoom: 9,
      minNativeZoom: 1,
      maxZoom: 7,
      noWrap: true,
      tileSize: 256,
      attribution: `<a href="https://www.arena.net/">ArenaNet</a> / <a href="https://twitter.com/that_shaman">ThatShaman</a>`,
      minZoom: 2,
    });
  }

  getMistsLayer(): TileLayer {
    return tileLayer('https://tiles.guildwars2.com/2/1/{z}/{x}/{y}.jpg', {
      maxNativeZoom: 6,
      minNativeZoom: 3,
      maxZoom: 6,
      noWrap: true,
      tileSize: 256,
      attribution: `<a href="https://www.arena.net/">ArenaNet</a> / <a href="https://gw2timer.com/wvw">Gw2Timer</a>`,
      minZoom: 3,
    })
  }

  getRegionLabels(continentId: number, floorId: number): Observable<RegionLabel[]> {
    return this.http.get<RegionLabel[]>(`/assets/data/region_labels_${continentId}_${floorId}.json`);
  }

  private getSvgLayer(dimensions: PointTuple): Observable<SVGSVGElement> {
    const layer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    layer.setAttribute('viewBox', `0 0 ${dimensions[0]} ${dimensions[1]}`);
    return of(layer);
  }

  getRegionLayer(leaflet: Map, continentId: number, floorId: number): Observable<SVGOverlay> {
    return this.getRegionLabels(continentId, floorId)
      .pipe(
        map(labels => labels.filter(l => l.label_coordinates && l.type.toLowerCase() === "region")),
        map((labels) => labels.reduce((prev, label) => prev +=
          `<text x="${label.label_coordinates[0]}" y="${label.label_coordinates[1]}" dominant-baseline="middle" text-anchor="middle" class="region-heading">${label.heading}</text>`, "")),
        withLatestFrom(this.getSvgLayer(this.tyriaDimensions)),
        map(([overlayContent, layer]) => {
          layer.innerHTML = overlayContent;
          return svgOverlay(layer, new LatLngBounds(leaflet.unproject([0, 0], leaflet.getMaxZoom()), leaflet.unproject(this.tyriaDimensions, leaflet.getMaxZoom())), {zIndex: 999})
        })
      );
  }

  getMapLayer(leaflet: Map, continentId: number, floorId: number): Observable<SVGOverlay> {
    return this.getRegionLabels(continentId, floorId)
      .pipe(
        map(labels => labels.filter(l => l.label_coordinates && l.type.toLowerCase() === "map")),
        map((labels) => labels.reduce((prev, label) => prev +=
            `<text x="${label.label_coordinates[0]}" y="${label.label_coordinates[1]}" dominant-baseline="middle" text-anchor="middle" class="map-heading">${label.heading}</text>
           <text x="${label.label_coordinates[0]}" y="${label.label_coordinates[1] + 120}" dominant-baseline="middle" text-anchor="middle" class="map-subheading">${label.subheading ?? ""}</text>`,
          "")),
        withLatestFrom(this.getSvgLayer(this.tyriaDimensions)),
        map(([overlayContent, layer]) => {
          layer.innerHTML = overlayContent
          return svgOverlay(layer, new LatLngBounds(leaflet.unproject([0, 0], leaflet.getMaxZoom()), leaflet.unproject(this.tyriaDimensions, leaflet.getMaxZoom())), {zIndex: 999})
        }));
  }

  private getFeatureGroup(): Observable<FeatureGroup> {
    return of(new FeatureGroup());
  }

  getPoiLabels(continentId: number, floorId: number): Observable<MarkerLabel[]> {
    return this.http.get<MarkerLabel[]>(`/assets/data/poi_labels_${continentId}_${floorId}.json`);
  }

  getIcon(type: string): string {
    switch (type) {
      case "waypoint":
        return "assets/waypoint.png";
      case "poi":
        return "assets/poi.png";
      case "vista":
        return "assets/vista.png";
      case "unlock":
        return "";
    }
    return "assets/poi.png";
  }

  private createStandardCanvasMarker(leaflet: Map, label: MarkerLabel, layer: LayerGroup) {
    this.labelService.createCanvasMarker(leaflet, label.coordinates, label.data.icon ?? this.getIcon(label.type), 0, [32, 32], 16)
      .bindTooltip(label.data.tooltip !== "" ? label.data.tooltip : label.data.chat_link, {
        className: "tooltip",
        offset: new Point(25, 0)
      })
      .on("click", (_: any) => {
        this.clipboard.copy(label.data.chat_link);

        const msg = label.data.tooltip === "" ?
          `Copied ${label.data.chat_link} to clipboard!` :
          `Copied [${label.data.tooltip}] to clipboard!`;

        this.toastr.info(msg, "", {
          toastClass: "custom-toastr",
          positionClass: "toast-top-right"
        });
      })
      .on("dblclick", (_: any) => {
        if (label.data.tooltip !== "")
          window.open(`https://wiki.guildwars2.com/wiki/?search=${label.data.tooltip}&ns0=1`)
        else {
          const chatLink = encodeURIComponent(label.data.chat_link)
          window.open(`https://wiki.guildwars2.com/wiki/?search=${chatLink}&ns0=1`)
        }
      })
      .addTo(layer)
  }

  getLandmarkLayer(leaflet: Map, continentId: number, floorId: number): Observable<FeatureGroup> {
    return this.getPoiLabels(continentId, floorId).pipe(
      map(labels => labels.filter(l => l.coordinates && l.type === "landmark")),
      combineLatestWith(this.getFeatureGroup()),
      tap(([labels, layer]) => labels.forEach(label => this.createStandardCanvasMarker(leaflet, label, layer))),
      map(([_, layer]) => layer)
    )
  }

  getWaypointLayer(leaflet: Map, continentId: number, floorId: number): Observable<FeatureGroup> {
    return this.getPoiLabels(continentId, floorId).pipe(
      map(labels => labels.filter(l => l.coordinates && l.type === "waypoint")),
      tap(labels => console.log(labels)),
      combineLatestWith(this.getFeatureGroup()),
      tap(([labels, layer]) => labels.forEach(label => this.createStandardCanvasMarker(leaflet, label, layer))),
      map(([_, layer]) => layer)
    )
  }

  getVistaLayer(leaflet: Map, continentId: number, floorId: number): Observable<FeatureGroup> {
    return this.getPoiLabels(continentId, floorId).pipe(
      map(labels => labels.filter(l => l.coordinates && l.type === "vista")),
      combineLatestWith(this.getFeatureGroup()),
      tap(([labels, layer]) => labels.forEach(label =>
        this.labelService.createCanvasMarker(leaflet, label.coordinates, "/assets/vista.png", 0, [32, 32], 16)
          .bindTooltip("Vista", {
            className: "tooltip",
            offset: new Point(25, 0)
          })
          .addTo(layer)
      )),
      map(([_, layer]) => layer)
    )
  }

  getUnlockLayer(leaflet: Map, continentId: number, floorId: number): Observable<FeatureGroup> {
    return this.getPoiLabels(continentId, floorId).pipe(
      map(labels => labels.filter(l => l.coordinates && l.type === "unlock")),
      combineLatestWith(this.getFeatureGroup()),
      tap(([labels, layer]) => labels.forEach(label => this.createStandardCanvasMarker(leaflet, label, layer))),
      map(([_, layer]) => layer)
    )
  }

  private createHeartBounds(label: MarkerLabel, leaflet: Map): Polygon {
    return new Polygon(
      label.data.bounds.map((coords: PointExpression) => leaflet.unproject(coords, leaflet.getMaxZoom())),
      { color: "yellow", opacity: .7, fillOpacity: .2, renderer: svg(), interactive: false }
    );
  }

  getHeartLayer(leaflet: Map, continentId: number, floorId: number): Observable<FeatureGroup> {
    return this.getPoiLabels(continentId, floorId).pipe(
      map(labels => labels.filter(l => l.coordinates && l.type === "heart")),
      combineLatestWith(this.getFeatureGroup()),
      tap(([labels, layer]) => labels.forEach(label => {
        const marker = this.labelService.createCanvasMarker(leaflet, label.coordinates as PointTuple, "/assets/hearts.png")
          .bindTooltip(`${label.data.tooltip}`, {className: "tooltip", offset: new Point(25, 0)})
          .on("dblclick", (_: any) => {
            window.open(`https://wiki.guildwars2.com/wiki/?search=${label.data.tooltip.substring(0, label.data.tooltip.length - 1)}&ns0=1`)
          })

        if (label.data.bounds) {
          marker.on("mouseover", (_: LeafletMouseEvent) => {
            const bounds: Polygon = this.createHeartBounds(label, leaflet)
              .addTo(leaflet)

            marker.once('mouseout', (_) => bounds.remove());
            marker.once("remove", (_) => bounds.remove());
          });
        }

        marker.addTo(layer);
      })),
      map(([_, layer]) => layer)
    )
  }

  getSkillPointLayer(leaflet: Map, continentId: number, floorId: number): Observable<FeatureGroup> {
    return this.getPoiLabels(continentId, floorId).pipe(
      map(labels => labels.filter(l => l.coordinates && l.type === "skillpoint")),
      combineLatestWith(this.getFeatureGroup()),
      tap(([labels, layer]) => labels.forEach(label =>
        this.labelService.createCanvasMarker(leaflet, label.coordinates as PointTuple, "/assets/heropoint.png")
          .bindTooltip("Skillpoint", {
            className: "tooltip",
            offset: new Point(25, 0)
          })
          .addTo(layer))),
      map(([_, layer]) => layer)
    )
  }

  getSectorLayer(leaflet: Map, continentId: number, floorId: number): Observable<FeatureGroup> {
    return this.getPoiLabels(continentId, floorId).pipe(
      map(labels => labels.filter(l => l.coordinates && l.type === "sector")),
      combineLatestWith(this.getFeatureGroup()),
      tap(([labels, layer]) => labels.forEach(label =>
        new Polygon(label.data.bounds.map((coords: PointExpression) => leaflet.unproject(coords, leaflet.getMaxZoom())),  {color: 'white'})
          .bindTooltip(label.data.tooltip !== "" ? label.data.tooltip : label.data.chat_link, { className: "tooltip", offset: new Point(25, 0)} )
          .on("click", (_: any) => {
            this.clipboard.copy(label.data.chat_link);

            const msg = label.data.tooltip === "" ?
              `Copied ${label.data.chat_link} to clipboard!` :
              `Copied [${label.data.tooltip}] to clipboard!`;

            this.toastr.info(msg, "", {
              toastClass: "custom-toastr",
              positionClass: "toast-top-right"
            });
          })
          .addTo(layer))),
      map(([_, layer]) => layer)
    )
  }

  getSectorTextLayer(leaflet: Map, continentId: number, floorId: number): Observable<SVGOverlay> {
    return this.getPoiLabels(continentId, floorId).pipe(
      map(labels => labels.filter(l => l.coordinates && l.type === "sector")),
      map((labels) => labels.reduce((prev, label) => prev +=
          `<text x="${label.coordinates[0]}" y="${label.coordinates[1]}" dominant-baseline="middle" text-anchor="middle" class="sector-heading">${label.data.tooltip}</text>`,
        "")),
      withLatestFrom(this.getSvgLayer(this.tyriaDimensions)),
      map(([overlayContent, layer]) => {
        layer.innerHTML = overlayContent
        return svgOverlay(layer, new LatLngBounds(leaflet.unproject([0, 0], leaflet.getMaxZoom()), leaflet.unproject(this.tyriaDimensions, leaflet.getMaxZoom())), {zIndex: 999})
      }));
  }

  getMasteryPointIcon(type: string): string {
    switch (type) {
      case "Tyria":
        return "assets/core_mastery.png";
      case "Maguuma":
        return "assets/hot_mastery.png";
      case "Desert":
        return "assets/pof_mastery.png";
      case "Tundra":
        return "assets/ibs_mastery.png";
      case "Unknown":
        return "assets/eod_mastery.png";
    }
    return "assets/core_mastery.png";
  }

  getMasteryPointLayer(leaflet: Map, continentId: number, floorId: number): Observable<LayerGroup> {
    return this.getPoiLabels(continentId, floorId).pipe(
      map(labels => labels.filter(l => l.coordinates && l.type === "mastery")),
      combineLatestWith(this.getFeatureGroup()),
      tap(([labels, layer]) => labels.forEach(label =>
        this.labelService.createCanvasMarker(leaflet, label.coordinates as PointTuple, this.getMasteryPointIcon(label.data.type))
          .addTo(layer))),
      map(([_, layer]) => layer)
    )
  }

  getAdventureLabels(): Observable<MarkerLabel[]> {
    return this.http.get<MarkerLabel[]>("/assets/data/adventure_labels.json")
  }

  getAdventuresLayer(leaflet: Map): Observable<FeatureGroup> {
    return this.getAdventureLabels().pipe(
      combineLatestWith(of(new FeatureGroup())),
      tap(([labels, layer]) => labels.forEach(label => this.labelService.createCanvasMarker(leaflet, label.coordinates as PointTuple, "/assets/adventure_icon.png")
        .bindTooltip(label.id.toString(), { className: "tooltip", offset: new Point(25, 0) } )
        .addTo(layer)
        .on("dblclick", (_: any) => {
          window.open(label.data.url)
        }))),
      map(([_, layer]) => {
        return layer;
      }),
    )
  }

  getMistsObjectivesLayer(leaflet: Map): Observable<LayerGroup> {
    return this.wvwService.getAllObjectives()
      .pipe(
        map((objs) => {
          const objectives = new LayerGroup();

          for (let objKey in objs) {
            const data = objs[objKey];

            if (data.coord && data.map_id !== 968) {
              this.labelService.createCanvasMarker(leaflet, data.coord as PointTuple, data.marker)
                .bindTooltip(data.name, { className: "tooltip", offset: new Point(15, 0)})
                .on("click", (_: any) => {
                  this.clipboard.copy(data.chat_link);

                  const msg = `Copied [${data.name}] to clipboard!`;

                  this.toastr.info(msg, "", {
                    toastClass: "custom-toastr",
                    positionClass: "toast-top-right"
                  });
                })
                .addTo(objectives);
            }
          }

          return objectives;
        })
      )
  }

  getMistsMapHeadings(leaflet: Map): SVGOverlay {
    const mapLabelsLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    mapLabelsLayer.setAttribute('xmlns', "http://www.w3.org/2000/svg");
    mapLabelsLayer.setAttribute('viewBox', `0 0 ${this.mistsDimensions[0]} ${this.mistsDimensions[1]}`);

    const labels = [
      { label_coord: [10600,12750], content: "Eternal Battlegrounds" },
      { label_coord: [10800, 8700], content: "Red Desert Borderlands" },
      { label_coord: [14100, 10700], content: "Blue Alpine Borderlands"},
      { label_coord: [6900, 11450], content: "Green Alpine Borderlands"}
    ];

    let content = "";
    labels.forEach(label => {
      if (label.label_coord) {
        content += `
              <text x="${label.label_coord[0]}" y="${label.label_coord[1]}" dominant-baseline="middle" text-anchor="middle" class="map-heading">${label.content}</text>`
      }
    });
    mapLabelsLayer.innerHTML = content

    return svgOverlay(mapLabelsLayer, new LatLngBounds(leaflet.unproject([0, 0], leaflet.getMaxZoom()), leaflet.unproject(this.mistsDimensions, leaflet.getMaxZoom())))
  }

  createMistsObjectivesLayer(leaflet: Map, match: Match): FeatureGroup {
    const layer = new FeatureGroup();
    const objectives = match.objectives;

    for (let objKey in objectives) {
      const data = objectives[objKey];

      if (data.coord && data.label_coord) {
        const markerUrl = data.claimed_by === "" ? data.marker : `/assets/${data.type}_${data.owner}.png`.toLowerCase()
        const icons: CanvasIcon[] = [];

        let upgradeLevel = this.wvwService.calculateUpgradeLevel(data.yaks_delivered);
        if (data.type !== "Ruins") {
          icons.push(...Array.from({length: upgradeLevel},
            (_, i): CanvasIcon => ({ url: "assets/upgrade_pip.png", position: "top", offset: [0, i % 2 === 1 ? 0 : 5], size: [10, 10] })));

          if (data.claimed_by) {
            icons.push({
              url: "assets/guild_claimed.png",
              position: "bottomRight",
              size: [13,13],
              offset: [0, 0]
            })
          }

          if (data.last_flipped) {
            if (moment(moment.now()).diff(moment(data.last_flipped), "second") <= 300) {
              icons.push({
                url: "assets/no_entry.png",
                position: "bottomLeft",
                size: [13,13],
                offset: [0, 0]
              })
            }
          }
        }

        const marker = this.labelService.createCanvasMarker(leaflet, data.coord as PointTuple, markerUrl, 0, data.type === "Ruins" ? [24, 24] : [32, 32], 16, icons)
          .bindTooltip("Loading...", {className: "tooltip-overlay", offset: new Point(15, 0)})
          .on("click", (event: any) => event.data = data)
          .addTo(layer);

        this.updateObjectiveTooltip(marker, data, match.friendly_names)
          .subscribe(content => marker.setTooltipContent(content));
      }
    }

    const regionLabelLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    regionLabelLayer.setAttribute('xmlns', "http://www.w3.org/2000/svg");
    regionLabelLayer.setAttribute('viewBox', `0 0 ${this.mistsDimensions[0]} ${this.mistsDimensions[1]}`);

    let content = "";
    objectives.forEach(label => {
      if (label.label_coord && label.type === "Spawn" && label.map_id !== 968) {
        content += `
              <text x="${label.label_coord[0]}" y="${label.label_coord[1]}"
                    dominant-baseline="middle" text-anchor="middle"
                    class="mists-spawn mists ${label.owner.toLowerCase()}">
                    ${match.friendly_names[label.owner.toLowerCase()]}
              </text>`
      }
    });
    regionLabelLayer.innerHTML = content

    svgOverlay(regionLabelLayer, new LatLngBounds(leaflet.unproject([0, 0], leaflet.getMaxZoom()), leaflet.unproject(this.mistsDimensions, leaflet.getMaxZoom())))
      .addTo(layer);

    return layer;
  }

  updateObjectiveTooltip(marker: Marker, obj: MergedObjective, teamNames: {[team: string]: string}): Observable<string> {
    return iif(() => !!obj.claimed_by,
      this.guildService.getGuild(obj.claimed_by),
      of<Guild>({emblem: undefined, id: "", name: "Unknown", tag: "[]"})
    ).pipe(
      map(guild => {
        let content = "";
        const upgradeLevel = this.wvwService.calculateUpgradeLevel(obj.yaks_delivered)

        content += `<p class="m-0 pl-1 text-base">${obj.name}</p>`
        content += `<p class="m-0 pl-1"><span class="mx-1">${obj.type}</span>`;

        if (upgradeLevel > 0) {
          content += `<span class="mx-1">- Tier ${upgradeLevel} ${this.wvwService.getFriendlyUpgradeLevel(upgradeLevel)}</span>`
        }

        for (let i = 0; i < upgradeLevel; i++) {
          content += `<img style='padding-left: 1px' src='assets/upgrade_pip.png'/>`
        }
        content += "</p>"


        content += `<p class="m-0 pl-2 vertical-align-middle"><img src="assets/capture_icon.png" width="16" height="16" class="vertical-align-middle"> +${obj.points_capture} Capture</p>`
        content += "<hr>"

        content += "<p class='m-0'>Controlled By:</p>"
        content += `<p class="m-0 pl-1 mists ${obj.owner.toLowerCase()}">${teamNames[obj.owner.toLowerCase()]}</p>`

        if (obj.claimed_by) {
          content += "<p class='m-0'>Claimed By:</p>"
          content += `<p class="m-0 pl-1">[${guild.tag}] ${guild.name}</p>`
        }

        if (obj.last_flipped) {
          content += "<hr>"
          content += "<p class='m-0'>Flipped:</p>"
          content += `<p class="m-0 pl-1">${moment(obj.last_flipped).utc(false).fromNow()}</p>` // .format("ddd, LTS")
        }

        return content;
      })
    )
  }
}
