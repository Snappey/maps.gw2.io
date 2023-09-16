import {FeatureGroup, Map, Marker, Point, PointTuple} from "leaflet";
import {Store} from "@ngrx/store";
import {AppState} from "../state/appState";
import {CanvasIcon, LabelService} from "../services/label.service";
import {
  CharacterPositionUpdate,
  CharacterStateUpdate,
  Mount,
  Profession,
  Vector2,
  Vector3
} from "../state/live-markers/live-markers.feature";
import {delay, filter, map, Observable, of, Subject, Subscription, switchMap, take, takeUntil, tap, timer} from "rxjs";

export class LiveMarker {
  private marker: Marker;
  private readonly forwardVector: Vector3 = { X: 1, Y: 0, Z: 0 }
  readonly accountName: string;
  readonly isSelf: boolean;
  private lastModified: number;
  private readonly expiryMs: number = 40_000;

  private profession: Profession = 0;
  private specialisation: number = 0; // TODO: Implement Specialisations
  private mount: Mount = 0;

  constructor(private leaflet: Map, private layer: FeatureGroup, private store: Store<AppState>, private labelService: LabelService, data: CharacterPositionUpdate, isSelf: boolean) {
    this.accountName = data.AccountName;
    this.isSelf = isSelf;

    this.marker = this.createMarker(
      [data.MapPosition.X, data.MapPosition.Y],
      this.degreesBetweenVectors(data.CharacterForward, this.forwardVector),
      data.CharacterName,
      []
    );
    this.lastModified = Date.now()
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

    this.profession = state.Profession;
    this.specialisation = state.Specialisation;
    this.mount = state.Mount;

    this.lastModified = Date.now();
  }

  updatePosition(data: CharacterPositionUpdate) {
    this.lastModified = Date.now();
    this.updateMarkerRotation.next(this.degreesBetweenVectors(data.CharacterForward, this.forwardVector))
    this.updateMarkerPosition.next(data.MapPosition);
  }

  private updateMarkerPosition: Subject<Vector2> = new Subject<Vector2>();

  private lastPositions: Vector2[] = [];
  private frameTime: number = 15;
  private perPositionTime: number = 300;
  private lastTimestamp: number = 0;
  private emaSpeed: number = 0;
  private alpha: number = 0.2;
  private speedCap: number = 0.05;

  private updateMarkerPosition$ = this.updateMarkerPosition.pipe(
    tap(position => {
      const currentTimestamp = Date.now();
      const deltaTime = this.lastTimestamp ? currentTimestamp - this.lastTimestamp : 0;
      this.lastTimestamp = currentTimestamp;

      this.lastPositions.push(position);

      if (this.lastPositions.length > 4) {
        this.lastPositions.shift();
      }

      if (this.lastPositions.length > 1) {
        const currentSpeed = this.calculateDistance(this.lastPositions.at(-1)!, this.lastPositions.at(-2)!) / deltaTime;
        this.emaSpeed = this.alpha * currentSpeed + (1 - this.alpha) * this.emaSpeed;

        if (this.emaSpeed > this.speedCap) {
          this.perPositionTime = this.frameTime * (1 / this.speedCap) * 0.9;
        } else {
          this.perPositionTime = this.frameTime * (1 / this.emaSpeed);
        }
      }
    }),
    switchMap(() => {
      if (this.lastPositions.length < 4) {
        return of(null);
      }

      return timer(0, this.frameTime).pipe(
        take(Math.ceil(this.perPositionTime / this.frameTime)),
        map(frame => {
          let t = (frame * this.frameTime) / this.perPositionTime;
          return this.catmullRom(t, this.lastPositions);
        }),
      );
    }),
  ).subscribe(newPosition => {
    if (newPosition) {
      this.marker.setLatLng(
        this.leaflet.unproject([newPosition.X, newPosition.Y], this.leaflet.getMaxZoom())
      );
    }
  });

  private updateMarkerRotation: Subject<number> = new Subject<number>();
  private updateMarkerRotation$ = this.updateMarkerRotation.pipe(
    // @ts-ignore
    switchMap(endRotation => of(...this.createAnglePath(this.marker.options.img.rotate, endRotation, 180)).pipe(
      delay(15)
    )) // @ts-ignore
  ).subscribe(newPosition => this.marker.options.img!.rotate = newPosition)

  private calculateDistance(p1: Vector2, p2: Vector2): number {
    return Math.sqrt(Math.pow(p2.X - p1.X, 2) + Math.pow(p2.Y - p1.Y, 2));
  }

  private catmullRom(t: number, points: Vector2[]): Vector2 | null {
    const n = points.length;
    if (n < 4) {
      return null;
    }

    let k = Math.floor(t * (n - 3));
    k = Math.max(0, Math.min(k, n - 4));

    const p0 = points[k];
    const p1 = points[k + 1];
    const p2 = points[k + 2];
    const p3 = points[k + 3];

    const t2 = t * t;
    const t3 = t2 * t;

    const x = 0.5 * ((2 * p1.X) + (-p0.X + p2.X) * t +
      (2*p0.X - 5*p1.X + 4*p2.X - p3.X) * t2 +
      (-p0.X + 3*p1.X - 3*p2.X + p3.X) * t3);

    const y = 0.5 * ((2 * p1.Y) + (-p0.Y + p2.Y) * t +
      (2*p0.Y - 5*p1.Y + 4*p2.Y - p3.Y) * t2 +
      (-p0.Y + 3*p1.Y - 3*p2.Y + p3.Y) * t3);

    return { X: x, Y: y };
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

  refreshLastModified() {
    this.lastModified = Date.now();
  }

  shouldExpire(): boolean {
    return Date.now() - this.lastModified > this.expiryMs;
  }

  panTo(setZoom: boolean = true) {
    if (setZoom)
      this.leaflet.setZoom(this.leaflet.getMaxZoom())

    this.leaflet.panTo(this.marker.getLatLng())
  }

  follow(setZoom: boolean = true): Observable<number> {
    return timer(0, 250).pipe(
      tap(_ => this.panTo(setZoom))
    );
  }

  getProfessionIcon(): string {
    switch(this.profession) {
      case Profession.Guardian:
        return "https://render.guildwars2.com/file/C32BE61FC55C962524624F643897ECF1A9C80462/156634.png";
      case Profession.Warrior:
        return "https://render.guildwars2.com/file/0A97E13F29B3597A447EEC04A09BE5BD699A2250/156643.png";
      case Profession.Engineer:
        return "https://render.guildwars2.com/file/5CCB361F44CCC7256132405D31E3A24DACCF440A/156632.png";
      case Profession.Ranger:
        return "https://render.guildwars2.com/file/49B10316B424F4E20139EB5E51ADCF24A8724E9B/156640.png";
      case Profession.Thief:
        return "https://render.guildwars2.com/file/F9EC00E23F630D6DB20CDA985592EC010E2A5705/156641.png";
      case Profession.Elementalist:
        return "https://render.guildwars2.com/file/77B793123251931AFF9FCA24C07E0F704BC4DA49/156630.png";
      case Profession.Mesmer:
        return "https://render.guildwars2.com/file/E43730AD49A903C3A1B4F27E41DE04EA51A775EC/156636.png";
      case Profession.Necromancer:
        return "https://render.guildwars2.com/file/AE56F8670807B87CF6EEE3FC7E6CB9710959E004/156638.png";
      case Profession.Revenant:
        return "https://render.guildwars2.com/file/7C9309BE7A2A48C6A9FBCC70CC1EBEBFD7593C05/961390.png";
      default:
        return "/assets/refresh_icon.png";
    }
  }

  getProfessionColour(): string {
    switch(this.profession) {
      case Profession.Guardian:
        return "#67AECB";
      case Profession.Warrior:
        return "#BC8D16";
      case Profession.Engineer:
        return "#98692C";
      case Profession.Ranger:
        return "#8EA53A";
      case Profession.Thief:
        return "#495578";
      case Profession.Elementalist:
        return "#A3362E";
      case Profession.Mesmer:
        return "#724192";
      case Profession.Necromancer:
        return "#3F5847";
      case Profession.Revenant:
        return "#572435";
      default:
        return "#DDD";
    }
  }

  isMounted(): boolean {
    return this.mount !== Mount.None;
  }

  getMountIcon(): string {
    switch(this.mount) {
      case Mount.None:
        return "";
      case Mount.Jackal:
        return "/assets/jackal_icon.png";
      case Mount.Griffon:
        return "/assets/griffon_icon.png";
      case Mount.Springer:
        return "/assets/springer_icon.png";
      case Mount.Skimmer:
        return "/assets/skimmer_icon.png";
      case Mount.Raptor:
        return "/assets/raptor_icon.png";
      case Mount.RollerBeetle:
        return "/assets/beetle_icon.png";
      case Mount.Warclaw:
        return "/assets/warclaw_icon.png";
      case Mount.Skyscale:
        return "/assets/skyscale_icon.png";
      case Mount.Skiff:
        return "/assets/skiff_icon.png";
      case Mount.SiegeTurtle:
        return "/assets/turtle_icon.png";
    }
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

