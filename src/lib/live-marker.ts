import {Map, Layer, Marker, Point, LayerGroup, FeatureGroup, Polyline, latLng} from "leaflet";
import {Store} from "@ngrx/store";
import {AppState} from "../state/appState";
import {CanvasIcon, LabelService} from "../services/label.service";
import {CharacterPositionUpdate, CharacterStateUpdate, Vector3, Vector2} from "../state/live-markers/live-markers.feature";
import {
  filter,
  interval,
  map,
  of,
  Subject,
  Subscription,
  switchMap,
  delay,
  concatMap,
  tap,
  mergeMap,
  range
} from "rxjs";

export class LiveMarker {
  private updateMarkerPosition: Subject<Vector2> = new Subject<Vector2>();
  private updateMarkerPosition$ = this.updateMarkerPosition.pipe(
    switchMap(endPosition => of(...this.createPath(this.getMarkerCoords(), endPosition, 500)).pipe(
      delay(5),
      tap(newPosition => this.marker.setLatLng(
        this.leaflet.unproject([newPosition.X, newPosition.Y], this.leaflet.getMaxZoom())))
    ))
  ).subscribe()
  private updateMarkerRotation: Subject<number> = new Subject<number>();
  private updateMarkerRotation$ = this.updateMarkerRotation.pipe(
    // @ts-ignore
    switchMap(endRotation => of(...this.createAnglePath(this.marker.options.img.rotate, endRotation, 180)).pipe(
      delay(50),
      // @ts-ignore
      tap(newPosition => this.marker.options.img.rotate = newPosition)
    ))
  ).subscribe()

  private marker: Marker;
  private readonly forwardVector: Vector3 = { X: 1, Y: 0, Z: 0 }
  readonly accountName: string;
  readonly isSelf: boolean;
  private lastUpdate: number;
  private readonly expiryMs: number = 40_000;

  constructor(private leaflet: Map, private layer: FeatureGroup, private store: Store<AppState>, private labelService: LabelService, data: CharacterPositionUpdate, isSelf: boolean) {
    this.accountName = data.AccountName;
    this.isSelf = isSelf;

    this.marker = this.createMarker(
      [data.MapPosition.X, data.MapPosition.Y],
      this.degreesBetweenVectors(data.CharacterForward, this.forwardVector),
      data.CharacterName,
      []
    );
    this.lastUpdate = Date.now()
  }

  createMarker(coords: [number, number], rotation: number, characterName: string, icons: CanvasIcon[]): Marker {
    return this.labelService.createCanvasMarker(
      this.leaflet,
      coords,
      this.isSelf ? "/assets/player_marker.png" : "/assets/global_player_dot.png",
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

    this.lastUpdate = Date.now();
  }

  updatePosition(data: CharacterPositionUpdate) {
    // @ts-ignore (img is a Custom property used by leaflet-canvas-markers)
    this.marker.options.img.rotate = this.degreesBetweenVectors(data.CharacterForward, this.forwardVector)
    this.marker.setLatLng(
      this.leaflet.unproject([data.MapPosition.X, data.MapPosition.Y], this.leaflet.getMaxZoom()));

    this.lastUpdate = Date.now();
    //this.updateMarkerRotation.next(this.degreesBetweenVectors(data.CharacterForward, this.forwardVector))
    //this.updateMarkerPosition.next(data.MapPosition);
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

  remove() {
    this.marker.remove();
    this.updateMarkerPosition$.unsubscribe();
    this.updateMarkerRotation$.unsubscribe();
  }

  updateLastUpdate() {
    this.lastUpdate = Date.now();
  }

  checkExpiry(): boolean {
    if (Date.now() - this.lastUpdate > this.expiryMs) {
      this.remove();
      return true;
    }
    return false;
  }

  panTo() {
    this.leaflet.panTo(this.marker.getLatLng())
    this.leaflet.setZoom(this.leaflet.getMaxZoom())
  }

  private getMarkerCoords(): Vector2 {
    const coords = this.leaflet.project(this.marker.getLatLng(), this.leaflet.getMaxZoom());
    return {
      X: coords.x,
      Y: coords.y
    };
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

  private createPath(start: Vector2, end: Vector2, iterations: number): Vector2[] {
    const res: Vector2[] = [];
    for (let i = 0; i < iterations; i++) {
      res.push(this.perpVector2(start, end, (1 - i/iterations)))
    }
    return res.reverse();
  }

  private lerpVector2(start: Vector2, end: Vector2, t: number): Vector2 {
    return {
      X: start.X + (end.X - start.X) * t,
      Y: start.Y + (end.Y - start.Y) * t
    }
  }

  private perpVector2(start: Vector2, end: Vector2, t: number): Vector2 {
    return {
      X: (1 - t) * (1 - t) * start.X + 2 * (1 - t) * t * (start.X + end.X) / 2 + t * t * end.X,
      Y: (1 - t) * (1 - t) * start.Y + 2 * (1 - t) * t * (start.Y + end.Y) / 2 + t * t * end.Y
    }
  }

  private createAnglePath(startAngle: number, endAngle: number, iterations: number): number[] {
    const res: number[] = [];
    for (let i = 0; i < iterations; i++) {
      res.push(this.lerpAngle(startAngle, endAngle, (1 - i/iterations)))
    }
    return res.reverse()
  }

  private lerpAngle(startAngle: number, endAngle: number, t: number): number {
    // convert angles to the range of -180 to 180 degrees
    startAngle = ((startAngle + 540) % 360) - 180;
    endAngle = ((endAngle + 540) % 360) - 180;

    // choose the shortest path for interpolation
    if (endAngle - startAngle > 180) {
      endAngle -= 360;
    } else if (endAngle - startAngle < -180) {
      endAngle += 360;
    }

    // perform the linear interpolation
    var angle = startAngle + (endAngle - startAngle) * t;

    // convert angle back to the range of -180 to 180 degrees
    angle = ((angle + 540) % 360) - 180;

    return angle;
  }
}

