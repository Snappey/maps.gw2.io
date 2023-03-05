import {Map, Layer, Marker, Point, LayerGroup, FeatureGroup, Polyline, latLng} from "leaflet";
import {Store} from "@ngrx/store";
import {AppState} from "../state/appState";
import {CanvasIcon, LabelService} from "../services/label.service";
import {CharacterPositionUpdate, CharacterStateUpdate, Vector3} from "../state/live-markers/live-markers.feature";
import {filter, interval, map, Subscription, tap} from "rxjs";

export class LiveMarker {
  private marker: Marker;
  private markerTrail: Polyline;
  private readonly forwardVector: Vector3 = { X: 1, Y: 0, Z: 0 }
  private readonly accountName: string;


  private markerTrailUpdate: Subscription;
  constructor(private leaflet: Map, private layer: FeatureGroup, private store: Store<AppState>, private labelService: LabelService, data: CharacterPositionUpdate) {
    console.log("created live marker for", data.AccountName);
    this.accountName = data.AccountName;

    this.marker = this.createMarker(
      [data.MapPosition.X, data.MapPosition.Y],
      this.degreesBetweenVectors(data.CharacterForward, this.forwardVector),
      data.CharacterName,
      []
    );

    this.markerTrail = new Polyline([this.marker.getLatLng()], { color: "#DDD", stroke: true, weight: 5.5, dashArray: "0.5 50" } )
    this.markerTrail.addTo(layer);

    this.markerTrailUpdate = interval(500).pipe(
      map(_ => this.marker.getLatLng()),
      filter(latLng => latLng !== this.markerTrail.getLatLngs().at(-1)),
    ).subscribe(latLng => this.markerTrail.addLatLng(latLng));
  }

  createMarker(coords: [number, number], rotation: number, characterName: string, icons: CanvasIcon[]): Marker {
    return this.labelService.createCanvasMarker(
      this.leaflet,
      coords,
      "/assets/player_marker.png",
      rotation,
      [32, 32],
      32,
      icons
    ).bindTooltip(characterName + " (" + this.accountName + ")", {className: "tooltip-overlay", offset: new Point(15, 0)})
      .addTo(this.layer);
  }

  updateState(state: CharacterStateUpdate) {
    const coords = this.leaflet.project(this.marker.getLatLng(), this.leaflet.getMaxZoom());
    // @ts-ignore
    const rotation = this.marker.options.img.rotate;

    const newMarker = this.createMarker([coords.x, coords.y], rotation, state.CharacterName, this.getIcons(state));
    this.marker.remove();
    this.marker = newMarker;
  }

  updatePosition(data: CharacterPositionUpdate) {
    // @ts-ignore (img is a Custom property used by leaflet-canvas-markers)
    this.marker.options.img.rotate = this.degreesBetweenVectors(data.CharacterForward, this.forwardVector)
    this.marker.setLatLng(
      this.leaflet.unproject([data.MapPosition.X, data.MapPosition.Y], this.leaflet.getMaxZoom()));
  }

  getIcons(state: CharacterStateUpdate): CanvasIcon[] {
    const icons: CanvasIcon[] = [];

    if (state.IsCommander) {
      icons.push({
        url: "/assets/commander_blue.png",
        position: "top",
        size: [12,12],
        offset: [0, 0]
      })
    }

    return icons;
  }

  Remove() {
    console.log("deleted live marker for " + this.accountName);
    this.marker.remove();
    this.markerTrail.remove()
    this.markerTrailUpdate.unsubscribe();
  }

  private degreesBetweenVectors(vector1: Vector3, vector2: Vector3) {
    const dotProduct = vector1.X * vector2.X + vector1.Y * vector2.Y;
    const magnitude1 = Math.sqrt(vector1.X * vector1.X + vector1.Y * vector1.Y);
    const magnitude2 = Math.sqrt(vector2.X * vector2.X + vector2.Y * vector2.Y);
    const cosTheta = dotProduct / (magnitude1 * magnitude2);
    const thetaRadians = Math.acos(cosTheta);
    const crossProduct = vector1.X * vector2.Y - vector1.Y * vector2.X;
    const sign = crossProduct >= 0 ? 1 : -1;
    return sign * thetaRadians * (180 / Math.PI);
  }
}
