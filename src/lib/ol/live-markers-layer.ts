import {Feature} from "ol";
import OlMap from "ol/Map";
import Point from "ol/geom/Point";
import VectorSource from "ol/source/Vector";
import {Icon, Style} from "ol/style";
import {containsCoordinate} from "ol/extent";
import {BehaviorSubject, interval, map, Observable, of, Subject, Subscription, switchMap, take, tap, timer} from "rxjs";
import {
  CharacterPositionUpdate,
  CharacterStateUpdate,
  Mount,
  MqttPayloadType,
  Profession,
  Vector2,
  Vector3,
} from "../../state/live-markers/live-markers.feature";
import {SidebarLiveMarker} from "../live-marker-types";
import {gw2ToOl} from "./gw2-projection";

const FORWARD_VECTOR: Vector3 = {X: 1, Y: 0, Z: 0};
const EXPIRY_MS = 40_000;
const EXPIRY_SWEEP_MS = 30_000;
const DEG_TO_RAD = Math.PI / 180;

/**
 * One live player on an OL map: a single Feature whose geometry/rotation are
 * animated in place. Ports the Catmull-Rom position interpolation, EMA speed
 * pacing, and shortest-path rotation lerp from src/lib/live-marker.ts.
 */
export class OlLiveMarker implements SidebarLiveMarker {
  readonly feature: Feature<Point>;
  readonly accountName: string;
  readonly isSelf: boolean;

  private icon: Icon;
  private styles: Style[];
  private rotationDeg = 0;
  private lastModified = Date.now();

  private profession: Profession = Profession.Unknown;
  private mount: Mount = Mount.None;

  // Interpolation state (same constants as the Leaflet implementation).
  private lastPositions: Vector2[] = [];
  private frameTime = 15;
  private perPositionTime = 300;
  private lastTimestamp = 0;
  private emaSpeed = 0;
  private alpha = 0.2;
  private speedCap = 0.05;

  private updateMarkerPosition = new Subject<Vector2>();
  private updateMarkerRotation = new Subject<number>();
  private positionSub: Subscription;
  private rotationSub: Subscription;

  constructor(
    private source: VectorSource,
    private olMap: OlMap,
    data: CharacterPositionUpdate,
    isSelf: boolean,
  ) {
    this.accountName = data.AccountName;
    this.isSelf = isSelf;
    this.rotationDeg = degreesBetweenVectors(data.CharacterForward, FORWARD_VECTOR);

    this.icon = this.createIcon();
    this.styles = [new Style({image: this.icon})];

    this.feature = new Feature({geometry: new Point(gw2ToOl([data.MapPosition.X, data.MapPosition.Y]))});
    this.feature.setId(data.AccountName);
    this.feature.setProperties({
      layer: "live",
      tooltip: `${data.CharacterName} (${data.AccountName})`,
    });
    this.feature.setStyle(this.styles);
    source.addFeature(this.feature);

    this.positionSub = this.updateMarkerPosition.pipe(
      tap(position => this.trackSpeed(position)),
      switchMap(() => {
        if (this.lastPositions.length < 4) {
          return of(null);
        }
        return timer(0, this.frameTime).pipe(
          take(Math.ceil(this.perPositionTime / this.frameTime)),
          map(frame => catmullRom((frame * this.frameTime) / this.perPositionTime, this.lastPositions)),
        );
      }),
    ).subscribe(position => {
      if (position) {
        this.feature.getGeometry()!.setCoordinates(gw2ToOl([position.X, position.Y]));
      }
    });

    // The Leaflet version's delay() emitted the whole angle path at once; pace
    // it on the frame timer instead so the turn is actually visible.
    this.rotationSub = this.updateMarkerRotation.pipe(
      switchMap(endRotation => {
        const path = createAnglePath(this.rotationDeg, endRotation, 12);
        return timer(0, this.frameTime).pipe(
          take(path.length),
          map(i => path[i]),
        );
      }),
    ).subscribe(angle => {
      this.rotationDeg = angle;
      this.icon.setRotation(angle * DEG_TO_RAD);
      this.feature.changed();
    });
  }

  private createIcon(): Icon {
    return new Icon({
      src: this.isSelf ? "assets/player_marker.png" : "assets/global_player_dot.png",
      width: 32,
      height: 32,
      rotation: this.rotationDeg * DEG_TO_RAD,
      rotateWithView: true,
    });
  }

  private trackSpeed(position: Vector2) {
    const currentTimestamp = Date.now();
    const deltaTime = this.lastTimestamp ? currentTimestamp - this.lastTimestamp : 0;
    this.lastTimestamp = currentTimestamp;

    this.lastPositions.push(position);
    if (this.lastPositions.length > 4) {
      this.lastPositions.shift();
    }

    if (this.lastPositions.length > 1 && deltaTime > 0) {
      const currentSpeed = distance(this.lastPositions.at(-1)!, this.lastPositions.at(-2)!) / deltaTime;
      this.emaSpeed = this.alpha * currentSpeed + (1 - this.alpha) * this.emaSpeed;
      this.perPositionTime = this.emaSpeed > this.speedCap ?
        this.frameTime * (1 / this.speedCap) * 0.9 :
        this.frameTime * (1 / this.emaSpeed);
    }
  }

  updatePosition(data: CharacterPositionUpdate) {
    this.lastModified = Date.now();
    this.updateMarkerRotation.next(degreesBetweenVectors(data.CharacterForward, FORWARD_VECTOR));
    this.updateMarkerPosition.next(data.MapPosition);
  }

  updateState(state: CharacterStateUpdate) {
    this.profession = state.Profession;
    this.mount = state.Mount;
    this.lastModified = Date.now();

    this.feature.set("tooltip", `${state.CharacterName} (${this.accountName})`);
    this.styles = [new Style({image: this.icon})];
    if (state.IsCommander) {
      this.styles.push(new Style({
        image: new Icon({src: "assets/commander_blue.png", width: 12, height: 12, displacement: [0, 22]}),
      }));
    }
    this.feature.setStyle(this.styles);
  }

  refreshLastModified() {
    this.lastModified = Date.now();
  }

  shouldExpire(): boolean {
    return Date.now() - this.lastModified > EXPIRY_MS;
  }

  panTo(setZoom: boolean = true) {
    const view = this.olMap.getView();
    if (setZoom) {
      view.setZoom(view.getMaxZoom());
    }
    view.setCenter(this.feature.getGeometry()!.getCoordinates());
  }

  follow(setZoom: boolean = true): Observable<number> {
    return timer(0, 250).pipe(tap(() => this.panTo(setZoom)));
  }

  getProfessionIcon(): string {
    return PROFESSION_ICONS[this.profession] ?? "/assets/refresh_icon.png";
  }

  getProfessionColour(): string {
    return PROFESSION_COLOURS[this.profession] ?? "#DDD";
  }

  isMounted(): boolean {
    return this.mount !== Mount.None;
  }

  getMountIcon(): string {
    return MOUNT_ICONS[this.mount] ?? "";
  }

  remove() {
    this.positionSub.unsubscribe();
    this.rotationSub.unsubscribe();
    if (this.source.hasFeature(this.feature)) {
      this.source.removeFeature(this.feature);
    }
  }
}

/**
 * Consumes the broker message stream for one OL map; mirrors the Leaflet
 * pipeline in LiveMarkersService's constructor (create/update/delete/keepalive
 * + expiry sweep) against a VectorSource.
 */
export class OlLiveMarkersController {
  readonly source = new VectorSource();
  /** Current marker list for the sidebar; updated on create/delete/expire. */
  readonly activeMarkers$ = new BehaviorSubject<OlLiveMarker[]>([]);

  private markers: {[accountName: string]: OlLiveMarker} = {};
  private subscriptions = new Subscription();
  private userAccount?: string;

  constructor(
    private olMap: OlMap,
    private continentId: number,
    messages$: Observable<{accountName: string, data: {Type: MqttPayloadType}}>,
    userAccount$: Observable<string | undefined>,
  ) {
    this.subscriptions.add(userAccount$.subscribe(account => this.userAccount = account));
    this.subscriptions.add(messages$.subscribe(({accountName, data}) => this.onMessage(accountName, data)));
    this.subscriptions.add(interval(EXPIRY_SWEEP_MS).subscribe(() => {
      let expired = false;
      for (const key of Object.keys(this.markers)) {
        if (this.markers[key].shouldExpire()) {
          this.markers[key].remove();
          delete this.markers[key];
          expired = true;
        }
      }
      if (expired) {
        this.publishMarkers();
      }
    }));
  }

  private publishMarkers() {
    this.activeMarkers$.next(Object.values(this.markers));
  }

  private onMessage(accountName: string, data: {Type: MqttPayloadType}) {
    const marker = this.markers[accountName];
    if (data.Type !== "UpsertCharacterMovement" && !marker) {
      return; // ignore until first movement
    }

    switch (data.Type) {
      case "UpsertCharacterMovement": {
        const msg = {...(data as CharacterPositionUpdate), AccountName: accountName};
        if (msg.ContinentId && msg.ContinentId !== this.continentId) {
          return; // other continent (guild/solo channels span both)
        }
        if (!marker) {
          this.markers[accountName] = new OlLiveMarker(this.source, this.olMap, msg, accountName === this.userAccount);
          this.publishMarkers();
        } else if (this.inView([msg.MapPosition.X, msg.MapPosition.Y])) {
          marker.updatePosition(msg); // like Leaflet: skip interpolation off-screen
        }
        return;
      }
      case "UpdateCharacterState":
        marker.updateState({...(data as CharacterStateUpdate), AccountName: accountName});
        this.publishMarkers();
        return;
      case "DeleteCharacterData":
        marker.remove();
        delete this.markers[accountName];
        this.publishMarkers();
        return;
      case "UpdateCharacterKeepAlive":
        return marker.refreshLastModified();
      default:
        console.warn(`received unimplemented packet type from ${accountName}: ${data.Type}`);
    }
  }

  private inView(coord: [number, number]): boolean {
    const extent = this.olMap.getView().calculateExtent(this.olMap.getSize());
    return containsCoordinate(extent, gw2ToOl(coord));
  }

  destroy() {
    this.subscriptions.unsubscribe();
    Object.values(this.markers).forEach(m => m.remove());
    this.markers = {};
    this.activeMarkers$.complete();
  }
}

const PROFESSION_ICONS: {[profession in Profession]?: string} = {
  [Profession.Guardian]: "https://render.guildwars2.com/file/C32BE61FC55C962524624F643897ECF1A9C80462/156634.png",
  [Profession.Warrior]: "https://render.guildwars2.com/file/0A97E13F29B3597A447EEC04A09BE5BD699A2250/156643.png",
  [Profession.Engineer]: "https://render.guildwars2.com/file/5CCB361F44CCC7256132405D31E3A24DACCF440A/156632.png",
  [Profession.Ranger]: "https://render.guildwars2.com/file/49B10316B424F4E20139EB5E51ADCF24A8724E9B/156640.png",
  [Profession.Thief]: "https://render.guildwars2.com/file/F9EC00E23F630D6DB20CDA985592EC010E2A5705/156641.png",
  [Profession.Elementalist]: "https://render.guildwars2.com/file/77B793123251931AFF9FCA24C07E0F704BC4DA49/156630.png",
  [Profession.Mesmer]: "https://render.guildwars2.com/file/E43730AD49A903C3A1B4F27E41DE04EA51A775EC/156636.png",
  [Profession.Necromancer]: "https://render.guildwars2.com/file/AE56F8670807B87CF6EEE3FC7E6CB9710959E004/156638.png",
  [Profession.Revenant]: "https://render.guildwars2.com/file/7C9309BE7A2A48C6A9FBCC70CC1EBEBFD7593C05/961390.png",
};

const PROFESSION_COLOURS: {[profession in Profession]?: string} = {
  [Profession.Guardian]: "#67AECB",
  [Profession.Warrior]: "#BC8D16",
  [Profession.Engineer]: "#98692C",
  [Profession.Ranger]: "#8EA53A",
  [Profession.Thief]: "#495578",
  [Profession.Elementalist]: "#A3362E",
  [Profession.Mesmer]: "#724192",
  [Profession.Necromancer]: "#3F5847",
  [Profession.Revenant]: "#572435",
};

const MOUNT_ICONS: {[mount in Mount]?: string} = {
  [Mount.Jackal]: "/assets/jackal_icon.png",
  [Mount.Griffon]: "/assets/griffon_icon.png",
  [Mount.Springer]: "/assets/springer_icon.png",
  [Mount.Skimmer]: "/assets/skimmer_icon.png",
  [Mount.Raptor]: "/assets/raptor_icon.png",
  [Mount.RollerBeetle]: "/assets/beetle_icon.png",
  [Mount.Warclaw]: "/assets/warclaw_icon.png",
  [Mount.Skyscale]: "/assets/skyscale_icon.png",
  [Mount.Skiff]: "/assets/skiff_icon.png",
  [Mount.SiegeTurtle]: "/assets/turtle_icon.png",
};

const distance = (p1: Vector2, p2: Vector2): number =>
  Math.sqrt((p2.X - p1.X) ** 2 + (p2.Y - p1.Y) ** 2);

function catmullRom(t: number, points: Vector2[]): Vector2 | null {
  const n = points.length;
  if (n < 4) {
    return null;
  }

  let k = Math.floor(t * (n - 3));
  k = Math.max(0, Math.min(k, n - 4));

  const [p0, p1, p2, p3] = [points[k], points[k + 1], points[k + 2], points[k + 3]];
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    X: 0.5 * ((2 * p1.X) + (-p0.X + p2.X) * t +
      (2 * p0.X - 5 * p1.X + 4 * p2.X - p3.X) * t2 +
      (-p0.X + 3 * p1.X - 3 * p2.X + p3.X) * t3),
    Y: 0.5 * ((2 * p1.Y) + (-p0.Y + p2.Y) * t +
      (2 * p0.Y - 5 * p1.Y + 4 * p2.Y - p3.Y) * t2 +
      (-p0.Y + 3 * p1.Y - 3 * p2.Y + p3.Y) * t3),
  };
}

function degreesBetweenVectors(vector1: Vector3, vector2: Vector3): number {
  const dotProduct = vector1.X * vector2.X + vector1.Y * vector2.Y;
  const magnitude1 = Math.sqrt(vector1.X * vector1.X + vector1.Y * vector1.Y);
  const magnitude2 = Math.sqrt(vector2.X * vector2.X + vector2.Y * vector2.Y);
  const cosTheta = dotProduct / (magnitude1 * magnitude2);
  const thetaRadians = Math.acos(cosTheta);
  const crossProduct = vector1.X * vector2.Y - vector1.Y * vector2.X;
  return (crossProduct >= 0 ? 1 : -1) * thetaRadians * (180 / Math.PI);
}

function createAnglePath(startAngle: number, endAngle: number, iterations: number): number[] {
  const res: number[] = [];
  for (let i = 0; i < iterations; i++) {
    res.push(lerpAngle(startAngle, endAngle, (i + 1) / iterations));
  }
  return res;
}

function lerpAngle(startAngle: number, endAngle: number, t: number): number {
  startAngle = ((startAngle + 540) % 360) - 180;
  endAngle = ((endAngle + 540) % 360) - 180;

  if (endAngle - startAngle > 180) {
    endAngle -= 360;
  } else if (endAngle - startAngle < -180) {
    endAngle += 360;
  }

  const angle = startAngle + (endAngle - startAngle) * t;
  return ((angle + 540) % 360) - 180;
}
