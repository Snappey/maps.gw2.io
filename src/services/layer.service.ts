import {Injectable} from '@angular/core';
import {HttpClient} from "@angular/common/http";
import {Observable, map, tap, of, iif, combineLatestWith, take} from "rxjs";
import {
  FeatureGroup, ImageOverlay, imageOverlay,
  LatLngBounds,
  LayerGroup, LeafletMouseEvent,
  Map, Marker, Point,
  PointExpression,
  PointTuple, Polygon, PolylineOptions, svg,
  svgOverlay,
  SVGOverlay,
  tileLayer,
  TileLayer
} from "leaflet";
import {ClipboardService} from "ngx-clipboard";
import {ToastrService} from "ngx-toastr";
import {CanvasIcon, LabelService} from "./label.service";
import {FullMatchObjective, WvwService, Match, Objective} from "./wvw.service";
import {Guild, GuildService} from "./guild.service";
import moment from "moment";
import {AssetService, MarkerLabel, MarkerType, MasteryType} from "./asset.service";



@Injectable({
  providedIn: 'root'
})
export class LayerService {
  public tyriaDimensions: PointTuple = [81920, 114688];
  public mistsDimensions: PointTuple = [16384, 16384];

  constructor(
    private assetService: AssetService,
    private labelService: LabelService,
    private clipboard: ClipboardService,
    private toastr: ToastrService,
    private wvwService: WvwService,
    private guildService: GuildService,
  ) {
  }

  getTyriaTiles(): TileLayer {
    return tileLayer('https://tiles{s}.gw2.io/1/1/{z}/{x}/{y}.jpg', {
      subdomains: ["1", "2", "3", "4"],
      maxNativeZoom: 17,
      minNativeZoom: 1,
      maxZoom: 7,
      noWrap: true,
      tileSize: 256,
      attribution: `<a href="https://www.arena.net/">ArenaNet</a> / <a href="https://twitter.com/that_shaman">ThatShaman</a>`,
      minZoom: 2,
    });
  }

  getMistsTiles(): TileLayer {
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

  getMasteryPointIcon(type: MasteryType): string {
    switch (type) {
      case "Tyria":
        return "assets/core_mastery.png";
      case "Maguuma":
        return "assets/hot_mastery.png";
      case "Desert":
        return "assets/pof_mastery.png";
      case "Tundra":
        return "assets/ibs_mastery.png";
      case "Cantha":
        return "assets/eod_mastery.png";
      case "Horn of Maguuma":
        return "assets/soto_mastery.png"
      default:
        console.warn(type, "mastery is not implemented");
        return "assets/core_mastery.png";
    }
  }

  getMasteryPointFriendlyName(type: MasteryType): string {
    switch (type) {
      case "Tyria":
        return "Core";
      case "Maguuma":
        return "HoT";
      case "Desert":
        return "PoF";
      case "Tundra":
        return "IBS";
      case "Cantha":
        return "EoD";
      case "Horn of Maguuma":
        return "SOTO";
      default:
        return "Unknown";
    }
  }

  getIcon(type: MarkerType): string {
    switch (type) {
      case "waypoint":
        return "assets/waypoint.png";
      case "poi":
        return "assets/poi.png";
      case "vista":
        return "assets/vista.png";
      case "unlock":
        return ""; // TODO: Unlock dynamically assign their icon based off the data field, map to standard as refactor
      default:
        return "assets/poi.png";
    }
  }

  private getFeatureGroup = (): Observable<FeatureGroup> =>
    of(new FeatureGroup());

  private createSvgLabel = (text: string, coordinates: PointTuple, cssClasses: string[], xOffset: number = 0, yOffset: number = 0): string =>
    `<text x="${coordinates[0] + xOffset}" y="${coordinates[1] + yOffset}" dominant-baseline="middle" text-anchor="middle" class="${cssClasses.join(" ")}">${text}</text>`


  private createCanvasMarker(leaflet: Map, label: MarkerLabel, layer: LayerGroup) {
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
      .on("dblclick", (_: any) => label.data.tooltip !== "" ?
          window.open(`https://wiki.guildwars2.com/wiki/?search=${label.data.tooltip}&ns0=1`) :
          window.open(`https://wiki.guildwars2.com/wiki/?search=${encodeURIComponent(label.data.chat_link)}&ns0=1`)
      ).addTo(layer)
  }

  private createPolygon(leaflet: Map, coordinates: [number, number][], options?: PolylineOptions): Polygon {
    return new Polygon(
      coordinates.map((coords: PointExpression) => leaflet.unproject(coords, leaflet.getMaxZoom())),
      { renderer: svg(), ...options }
    );
  }

  private getSvgLayer(dimensions: PointTuple, content: string): SVGSVGElement {
    const layer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    layer.setAttribute('viewBox', `0 0 ${dimensions[0]} ${dimensions[1]}`);
    layer.innerHTML = content;

    return layer;
  }

  private trimBrackets = (text: string): string =>
    text.replaceAll(/([\[\]])*/g, "");

  getRegionLabels(leaflet: Map, continentId: number, floorId: number): Observable<SVGOverlay> {
    return this.assetService.fetchRegionLabels(continentId, floorId)
      .pipe(
        map(labels => labels.filter(l => l.label_coordinates && l.type.toLowerCase() === "region")),
        map(labels => labels.reduce((prev, label) =>
          prev += this.createSvgLabel(label.heading, label.label_coordinates, ["region-heading"]), "")),
        map((overlayContent) => this.getSvgLayer(this.tyriaDimensions, overlayContent)),
        map((layer) => svgOverlay(layer, new LatLngBounds(leaflet.unproject([0, 0], leaflet.getMaxZoom()), leaflet.unproject(this.tyriaDimensions, leaflet.getMaxZoom())), {zIndex: 999}))
      );
  }

  getMapLabels(leaflet: Map, continentId: number, floorId: number): Observable<SVGOverlay> {
    return this.assetService.fetchRegionLabels(continentId, floorId)
      .pipe(
        map(labels => labels.filter(l => l.label_coordinates && l.type.toLowerCase() === "map")),
        map(labels => labels.reduce((prev, label) =>
          prev += this.createSvgLabel(label.heading, label.label_coordinates, ["map-heading"])
               + this.createSvgLabel(label.subheading, label.label_coordinates, ["map-subheading"], 0, 120),"")),
        map((overlayContent) => this.getSvgLayer(this.tyriaDimensions, overlayContent)),
        map((layer) => svgOverlay(layer, new LatLngBounds(leaflet.unproject([0, 0], leaflet.getMaxZoom()), leaflet.unproject(this.tyriaDimensions, leaflet.getMaxZoom())), {zIndex: 999})))
  }

  getLandmarkLayer(leaflet: Map, continentId: number, floorId: number): Observable<FeatureGroup> {
    return this.assetService.fetchPointOfInterestLabels(continentId, floorId).pipe(
      map(labels => labels.filter(l => l.coordinates && l.type === "landmark")),
      combineLatestWith(this.getFeatureGroup()),
      tap(([labels, layer]) => labels.forEach(label => this.createCanvasMarker(leaflet, label, layer))),
      map(([_, layer]) => layer)
    )
  }

  getWaypointLayer(leaflet: Map, continentId: number, floorId: number): Observable<FeatureGroup> {
    return this.assetService.fetchPointOfInterestLabels(continentId, floorId).pipe(
      map(labels => labels.filter(l => l.coordinates && l.type === "waypoint")),
      combineLatestWith(this.getFeatureGroup()),
      tap(([labels, layer]) => labels.forEach(label => this.createCanvasMarker(leaflet, label, layer))),
      map(([_, layer]) => layer)
    )
  }

  getVistaLayer(leaflet: Map, continentId: number, floorId: number): Observable<FeatureGroup> {
    return this.assetService.fetchPointOfInterestLabels(continentId, floorId).pipe(
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
    return this.assetService.fetchPointOfInterestLabels(continentId, floorId).pipe(
      map(labels => labels.filter(l => l.coordinates && l.type === "unlock")),
      combineLatestWith(this.getFeatureGroup()),
      tap(([labels, layer]) => labels.forEach(label => this.createCanvasMarker(leaflet, label, layer))),
      map(([_, layer]) => layer)
    )
  }

  getHeartLayer(leaflet: Map, continentId: number, floorId: number): Observable<FeatureGroup> {
    return this.assetService.fetchPointOfInterestLabels(continentId, floorId).pipe(
      map(labels => labels.filter(l => l.coordinates && l.type === "heart")),
      combineLatestWith(this.getFeatureGroup()),
      tap(([labels, layer]) => labels.forEach(label => {
        const marker = this.labelService.createCanvasMarker(leaflet, label.coordinates, "/assets/hearts.png")
          .bindTooltip(label.data.tooltip, {className: "tooltip", offset: new Point(25, 0)})
          .on("dblclick", (_: any) =>
            window.open(`https://wiki.guildwars2.com/wiki/?search=${label.data.tooltip.substring(0, label.data.tooltip.length - 1)}&ns0=1`)
          ).addTo(layer);

        if (label.data.bounds) {
          marker.on("mouseover", (_: LeafletMouseEvent) => {
            const bounds: Polygon = this.createPolygon(leaflet, label.data.bounds, {
              color: "yellow", opacity: .7, fillOpacity: .2, interactive: false
            }).addTo(leaflet);

            marker.once('mouseout', (_) => bounds.remove());
            marker.once("remove", (_) => bounds.remove());
          });
        }
      })),
      map(([_, layer]) => layer)
    )
  }

  getSkillPointLayer(leaflet: Map, continentId: number, floorId: number): Observable<FeatureGroup> {
    return this.assetService.fetchPointOfInterestLabels(continentId, floorId).pipe(
      map(labels => labels.filter(l => l.coordinates && l.type === "skillpoint")),
      combineLatestWith(this.getFeatureGroup()),
      tap(([labels, layer]) => labels.forEach(label =>
        this.labelService.createCanvasMarker(leaflet, label.coordinates, "/assets/heropoint.png")
          .bindTooltip("Skillpoint", {
            className: "tooltip",
            offset: new Point(25, 0)
          })
          .addTo(layer))),
      map(([_, layer]) => layer)
    )
  }

  getSectorLayer(leaflet: Map, continentId: number, floorId: number): Observable<FeatureGroup> {
    return this.assetService.fetchPointOfInterestLabels(continentId, floorId).pipe(
      map(labels => labels.filter(l => l.coordinates && l.type === "sector")),
      combineLatestWith(this.getFeatureGroup()),
      tap(([labels, layer]) => labels.forEach(label =>
        this.createPolygon(leaflet, label.data.bounds, {color: "white"})
          .bindTooltip(label.data.tooltip !== "" ? label.data.tooltip : label.data.chat_link, { className: "tooltip", offset: new Point(25, 0)} )
          .on("click", _ => {
            this.clipboard.copy(label.data.chat_link);

            const msg = label.data.tooltip !== "" ?
              `Copied [${label.data.tooltip}] to clipboard!` :
              `Copied ${label.data.chat_link} to clipboard!`;

            this.toastr.info(msg, "", {
              toastClass: "custom-toastr",
              positionClass: "toast-top-right"
            });
          }).addTo(layer))),
      map(([_, layer]) => layer)
    )
  }

  getSectorTextLayer(leaflet: Map, continentId: number, floorId: number): Observable<SVGOverlay> {
    return this.assetService.fetchPointOfInterestLabels(continentId, floorId).pipe(
      map(labels => labels.filter(l => l.coordinates && l.type === "sector")),
      map(labels => labels.reduce((prev, label) => prev
        += this.createSvgLabel(label.data.tooltip, label.coordinates, ["sector-heading"]), "")),
      map((overlayContent) => this.getSvgLayer(this.tyriaDimensions, overlayContent)),
      map((layer) =>
        svgOverlay(layer, new LatLngBounds(leaflet.unproject([0, 0], leaflet.getMaxZoom()), leaflet.unproject(this.tyriaDimensions, leaflet.getMaxZoom())), {zIndex: 999})))
  }

  getMasteryPointLayer(leaflet: Map, continentId: number, floorId: number): Observable<LayerGroup> {
    return this.assetService.fetchPointOfInterestLabels(continentId, floorId).pipe(
      map(labels => labels.filter(l => l.coordinates && l.type === "mastery")),
      combineLatestWith(this.getFeatureGroup()),
      tap(([labels, layer]) => labels.forEach(label =>
        this.labelService.createCanvasMarker(leaflet, label.coordinates, this.getMasteryPointIcon(label.data.type))
          .bindTooltip(this.getMasteryPointFriendlyName(label.data.type) + " Mastery", { className: "tooltip", offset: new Point(25, 0) } )
          .addTo(layer))),
      map(([_, layer]) => layer)
    )
  }

  getAdventuresLayer(leaflet: Map): Observable<FeatureGroup> {
    return this.assetService.fetchAdventureLabels().pipe(
      combineLatestWith(this.getFeatureGroup()),
      tap(([labels, layer]) =>
        labels.forEach(label =>
          this.labelService.createCanvasMarker(leaflet, label.coordinates, "/assets/adventure_icon.png")
            .bindTooltip(label.id.toString(), { className: "tooltip", offset: new Point(25, 0) } )
            .on("dblclick", (_: any) =>
              window.open(label.data.url)
            ).addTo(layer)
        )
      ),
      map(([_, layer]) => layer)
    );
  }

  getCityMarkersLayer(leaflet: Map): Observable<FeatureGroup> {
    return this.assetService.fetchCityLabels().pipe(
      combineLatestWith(this.getFeatureGroup()),
      tap(([labels, layer]) =>
        labels.forEach(label =>
          this.labelService.createCanvasMarker(leaflet, label.coord, label.icon, 0, [24, 24])
            .bindTooltip(`${this.trimBrackets(label.text ?? label.name)}`, { className: "tooltip", offset: new Point(15, 0) } )
            .on("dblclick", (_: any) =>
              window.open(`https://wiki.guildwars2.com/wiki/?search=${this.trimBrackets(label.text ?? label.name)}&ns0=1`)
            ).addTo(layer)
        )
      ),
      map(([_, layer]) => layer)
    );
  }

  getMistsObjectives(leaflet: Map): Observable<FeatureGroup> {
    return this.wvwService.getAllObjectives()
      .pipe(
        map(objectives => objectives.filter(obj => obj.coord && obj.map_id !== this.EDGE_OF_THE_MISTS_MAP_ID)),
        combineLatestWith(this.getFeatureGroup()),
        tap(([objectives, layer]) =>
          objectives.forEach(obj =>
            this.labelService.createCanvasMarker(leaflet, obj.coord, obj.marker)
              .bindTooltip(obj.name, { className: "tooltip", offset: new Point(15, 0)})
              .on("click", (_: any) => {
                this.clipboard.copy(obj.chat_link);

                const msg = `Copied [${obj.name}] to clipboard!`;

                this.toastr.info(msg, "", {
                  toastClass: "custom-toastr",
                  positionClass: "toast-top-right"
                });
              }).addTo(layer)
          )
        ),
        map(([_, layer]) => layer)
      );
  }

  private mistsMatchHeadings: { label_coord: PointTuple, text: string }[] = [
    { label_coord: [10600,12750], text: "Eternal Battlegrounds" },
    { label_coord: [10800, 8700], text: "Red Desert Borderlands" },
    { label_coord: [14100, 10700], text: "Blue Alpine Borderlands"},
    { label_coord: [6900, 11450], text: "Green Alpine Borderlands"}
  ];

  private teamColours: { [teamName: string]: string } = {
    green: "#43D071",
    red: "#DC3939",
    blue: "#24A2E7",
    not_captured: "#DDD"
  }

  private OBSIDIAN_SANCTUM_MAP_ID = 1031 as const;
  private EDGE_OF_THE_MISTS_MAP_ID = 968 as const;

  private getTeamColour(teamName: string | undefined): string {
    if (teamName) {
      return this.teamColours[teamName.toLowerCase()]
    } else {
      return this.teamColours["not_captured"]
    }
  }

  private interpolateCoords(start: PointTuple, end: PointTuple, percentage: number): number[] {
    return [
      start[0] + (end[0] - start[0]) * percentage,
      start[1] + (end[1] - start[1]) * percentage
    ];
  }


  getMistsHeadings(leaflet: Map): Observable<SVGOverlay> {
    return of(this.mistsMatchHeadings).pipe(
      map(labels => labels.reduce((prev, cur) =>
        prev += this.createSvgLabel(cur.text, cur.label_coord, ["map-heading"]), "")),
      map(overlayContent => this.getSvgLayer(this.mistsDimensions, overlayContent)),
      map(layer => svgOverlay(layer, new LatLngBounds(leaflet.unproject([0, 0], leaflet.getMaxZoom()), leaflet.unproject(this.mistsDimensions, leaflet.getMaxZoom()))))
    )
  }

  createMistsObjectivesSectors(leaflet: Map, match: Match): Observable<FeatureGroup> {
    return this.assetService.fetchPointOfInterestLabels(2, 1).pipe(
      map(labels => labels.filter(l => {
          return l.coordinates && l.type === "sector" &&
              l.continent === "World vs. World" &&
              l.map !== "Edge of the Mists" &&
              l.id !== this.OBSIDIAN_SANCTUM_MAP_ID;
          } // Obsidian Sanctum
        )
      ),
      combineLatestWith(this.getFeatureGroup()),
      tap(([labels, layer]) =>
        labels.forEach(label =>
          this.createPolygon(leaflet,
            label.data.bounds
              .map((coords: PointTuple) => this.interpolateCoords(label.coordinates, coords, .97)),
            {
              color: this.getTeamColour(
                match.objectives.find(m => m.sector_id === label.id)?.owner
              ),
              fillOpacity: 0,
              interactive: false
            }).addTo(layer)
        )
      ),
      map(([_, layer]) => layer)
    )
  }

  createMistsMatchObjectives(leaflet: Map, match: Match): Observable<FeatureGroup> {
    return of(match.objectives).pipe(
      map(objectives => objectives.filter(obj => obj.coord && obj.label_coord)),
      combineLatestWith(this.getFeatureGroup()),
      tap(([objectives, layer]) =>
        objectives.forEach(data => {
          const markerUrl = data.claimed_by === "" ? data.marker : `/assets/${data.type}_${data.owner}.png`.toLowerCase()
          const icons: CanvasIcon[] = [];

          if (data.type !== "Ruins") {
            icons.push(...Array.from({length: this.wvwService.calculateUpgradeLevel(data.yaks_delivered)},
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

          const marker = this.labelService.createCanvasMarker(leaflet, data.coord, markerUrl, 0, data.type === "Ruins" ? [24, 24] : [32, 32], 16, icons)
            .bindTooltip("Loading...", {className: "tooltip-overlay", offset: new Point(15, 0)})
            .on("click", (event: any) => event.data = data)
            .addTo(layer);

          this.updateObjectiveTooltip(marker, data, match.friendly_names).pipe(
            take(1)
          ).subscribe(content => marker.setTooltipContent(content));
        })
      ),
      map(([_, layer]) => layer)
    )
  }

  createMistsMatchSpawnHeadings(leaflet: Map, match: Match): Observable<SVGOverlay> {
    return of(match.objectives).pipe(
      map(objectives => objectives.filter(obj => obj.label_coord && obj.type === "Spawn" && obj.map_id !== this.EDGE_OF_THE_MISTS_MAP_ID)),
      map(objectives => objectives.reduce((prev, cur) =>
        prev += this.createSvgLabel(match.friendly_names[cur.owner.toLowerCase()], cur.label_coord, ["mists-spawn", "mists", cur.owner.toLowerCase()]) , "")),
      map(overlayContent => this.getSvgLayer(this.mistsDimensions, overlayContent)),
      map(layer => svgOverlay(layer, new LatLngBounds(leaflet.unproject([0, 0], leaflet.getMaxZoom()), leaflet.unproject(this.mistsDimensions, leaflet.getMaxZoom()))))
    )
  }

  updateObjectiveTooltip(marker: Marker, obj: FullMatchObjective, teamNames: {[team: string]: string}): Observable<string> {
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

  getMarkerByChatLink(continentId: number, floorId: number, chatLink: string): Observable<MarkerLabel | undefined> {
    console.log(chatLink);
    return this.assetService.fetchPointOfInterestLabels(continentId, floorId).pipe(
      tap(console.log),
      map(labels => labels.filter((l: MarkerLabel) => l.coordinates && l.data?.chat_link &&
        l.data?.chat_link.includes(chatLink))),
      map(labels => labels.at(0)),
    )
  }

  createImageOverlay(leaflet: Map, coordinates: PointTuple, icon: string, width: number = 256, height: number = 256): ImageOverlay {
    return imageOverlay(icon,
      new LatLngBounds(
        leaflet.unproject([coordinates[0] - width*.5, coordinates[1] - height*.5], leaflet.getMaxZoom()),
        leaflet.unproject([coordinates[0] + width*.5, coordinates[1] + height*.5], leaflet.getMaxZoom())
      )
    )
  }
}
