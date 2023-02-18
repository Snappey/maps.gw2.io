import {Injectable} from '@angular/core';
import {HttpClient} from "@angular/common/http";
import {Observable, map, tap, of, iif} from "rxjs";
import {
  FeatureGroup,
  LatLngBounds,
  LayerGroup,
  Map, Marker, Point,
  PointTuple,
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

interface MapData {
  hearts: MarkerLabel[];
  masterypoints: MarkerLabel[];
  poi: MarkerLabel[];
  skillpoints: MarkerLabel[];
}

interface MarkerLabel {
  id: string;
  coordinates: PointTuple,
  type: string;
  data: any;
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
  ) { }

  getTyriaLayer(): TileLayer {
    return tileLayer('https://tiles.gw2.io/1/1/{z}/{x}/{y}.jpg', {
        maxNativeZoom: 7,
        minNativeZoom: 1,
        maxZoom: 7,
        noWrap: true,
        tileSize: 256,
        attribution: `<a href="https://www.arena.net/">ArenaNet</a> / <a href="https://twitter.com/that_shaman">ThatShaman</a>`,
        minZoom: 1,
      });
  }

  getMistsLayer(): TileLayer {
    return tileLayer( 'https://tiles.guildwars2.com/2/1/{z}/{x}/{y}.jpg', {
      maxNativeZoom: 6,
      minNativeZoom: 3,
      maxZoom: 6,
      noWrap: true,
      tileSize: 256,
      attribution: `<a href="https://www.arena.net/">ArenaNet</a> / <a href="https://gw2timer.com/wvw">Gw2Timer</a>`,
      minZoom: 3,
    })
  }

  getRegionLabels(): Observable<RegionLabel[]> {
    return this.http.get<RegionLabel[]>("/assets/data/region_labels.json");
  }

  getRegionLayer(leaflet: Map): Observable<SVGOverlay> {
    return this.getRegionLabels()
      .pipe(
        map(labels => {
        const regionLabelLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        regionLabelLayer.setAttribute('xmlns', "http://www.w3.org/2000/svg");
        regionLabelLayer.setAttribute('viewBox', `0 0 ${this.tyriaDimensions[0]} ${this.tyriaDimensions[1]}`);

        let content = "";
        labels.forEach(label => {
          if (label.label_coordinates && label.type.toLowerCase() === "region") {
            content += `
              <text x="${label.label_coordinates[0]}" y="${label.label_coordinates[1]}" dominant-baseline="middle" text-anchor="middle" class="region-heading">${label.heading}</text>`
          }
        });
        regionLabelLayer.innerHTML = content

        return svgOverlay(regionLabelLayer, new LatLngBounds(leaflet.unproject([0, 0], leaflet.getMaxZoom()), leaflet.unproject(this.tyriaDimensions, leaflet.getMaxZoom())), {zIndex: 999})
        })
      );
  }

  getMapLayer(leaflet: Map): Observable<SVGOverlay> {
    return this.getRegionLabels()
      .pipe(map(labels => {
        const mapLabelLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        mapLabelLayer.setAttribute('xmlns', "http://www.w3.org/2000/svg");
        mapLabelLayer.setAttribute('viewBox', `0 0 ${this.tyriaDimensions[0]} ${this.tyriaDimensions[1]}`);

        let content = "";
        labels.forEach(label => {
          if (label.label_coordinates && label.type.toLowerCase() === "map") {
            content += `
              <text x="${label.label_coordinates[0]}" y="${label.label_coordinates[1]}" dominant-baseline="middle" text-anchor="middle" class="map-heading">${label.heading}</text>
              <text x="${label.label_coordinates[0]}" y="${label.label_coordinates[1] + 180}" dominant-baseline="middle" text-anchor="middle" class="map-subheading">${label.subheading ?? ""}</text>`
          }
        });
        mapLabelLayer.innerHTML = content

        return svgOverlay(mapLabelLayer, new LatLngBounds(leaflet.unproject([0, 0], leaflet.getMaxZoom()), leaflet.unproject(this.tyriaDimensions, leaflet.getMaxZoom())), {zIndex: 999})
      }));
  }

  getPoiLabels(): Observable<GroupedLabels<MapData>> {
    return this.http.get<GroupedLabels<MapData>>("/assets/data/poi_labels.json")
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

  getPoiLayer(leaflet: Map): Observable<GroupedLayer> {
    return this.getPoiLabels()
      .pipe(
        tap((labels) => {
          Object.values(labels)
            .forEach(map => {
              if (map.poi) {
                map.poi.forEach(poi => {
                  if ("tooltip" in poi.data)
                    this.searchService.addSearch({type: poi.type, coords: poi.coordinates, name: poi.data.tooltip, chatLink: poi.data.chat_link, data: poi.data})
                })
              }
            })
        }),
        map(labels => {
        const layers: GroupedLayer = {
          "waypoint": new FeatureGroup(),
          "landmark": new FeatureGroup(),
          "vista": new FeatureGroup(),
          "unlock": new FeatureGroup()
        }

        for (let labelsKey in labels) {
          let data = labels[labelsKey];

          if (data.poi) {
            data.poi.forEach(label => {
              if (label.coordinates && label.type) {
                let icon = this.getIcon(label.type);

                if (label.data.icon) {
                  icon = label.data.icon;
                }

                this.labelService.createCanvasMarker(leaflet, label.coordinates, icon, 0,[32,32], 16)
                  .bindTooltip(label.data.tooltip !== "" ? label.data.tooltip : label.data.chat_link, { className: "tooltip", offset: new Point(25, 0)} )
                  .addTo(layers[label.type])
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
                  });

              }
            })
          }
        }

        return layers;
      })
    );
  }

  getHeartLabels(): Observable<GroupedLabels<MapData>> {
    return this.http.get<GroupedLabels<MapData>>("/assets/data/poi_labels.json")
  }

  getHeartLayer(leaflet: Map): Observable<LayerGroup> {
    return this.getHeartLabels()
      .pipe(
        tap((labels) => {
          Object.values(labels)
            .forEach(map => {
              map.hearts
                .forEach((heart) => {
                  if (heart.coordinates)
                    this.searchService.addSearch({type: "heart", coords: heart.coordinates, name: heart.data.tooltip, chatLink: heart.data.chat_link, data: heart.data})
                })
            })
        }),
        map(labels => {
          const hearts = new LayerGroup();

          for (let labelsKey in labels) {
            let data = labels[labelsKey];

            if (data.hearts) {
              data.hearts.forEach(label => {
                if (label.coordinates) {
                  this.labelService.createCanvasMarker(leaflet, label.coordinates as PointTuple, "assets/hearts.png")
                    .bindTooltip(`${label.data.tooltip}`, { className: "tooltip", offset: new Point(25, 0) } )
                    .addTo(hearts)
                    .on("dblclick", (_: any) => {
                      window.open(`https://wiki.guildwars2.com/wiki/?search=${label.data.tooltip.substring(0, label.data.tooltip.length - 1)}&ns0=1`)
                    });
                }
              })
            }
          }

          return hearts;
        })
      );
  }

  getSkillPointLabels(): Observable<GroupedLabels<MapData>> {
    return this.http.get<GroupedLabels<MapData>>("/assets/data/poi_labels.json")
  }

  getSkillPointLayer(leaflet: Map): Observable<LayerGroup> {
    return this.getSkillPointLabels()
      .pipe(map(labels => {
        const skillPoints = new LayerGroup();

        for (let labelsKey in labels) {
          let data = labels[labelsKey];

          if (data.skillpoints) {
            data.skillpoints.forEach(label => {
              if (label.coordinates) {
                this.labelService.createCanvasMarker(leaflet, label.coordinates as PointTuple, "assets/heropoint.png")
                  .addTo(skillPoints)
              }
            })
          }
        }

        return skillPoints;
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

  getMasteryPointLabels(): Observable<GroupedLabels<MapData>> {
    return this.http.get<GroupedLabels<MapData>>("/assets/data/poi_labels.json")
  }

  getMasteryPointLayer(leaflet: Map): Observable<LayerGroup> {
    return this.getMasteryPointLabels()
      .pipe(map(labels => {
        const masteries = new LayerGroup();

        for (let labelsKey in labels) {
          let data = labels[labelsKey];

          if (data.masterypoints) {
            data.masterypoints.forEach(label => {
              if (label.coordinates) {
                this.labelService.createCanvasMarker(leaflet, label.coordinates as PointTuple, this.getMasteryPointIcon(label.data.type))
                  .addTo(masteries)
              }
            })
          }
        }

        return masteries;
      }));
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
