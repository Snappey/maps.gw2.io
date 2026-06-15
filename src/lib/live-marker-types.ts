import {Observable} from "rxjs";
import {PointTuple} from "./types";

/**
 * What the live-marker sidebar needs from a player marker, independent of the
 * map library rendering it.
 */
export interface SidebarLiveMarker {
  readonly accountName: string;
  readonly isSelf: boolean;
  getProfessionIcon(): string;
  getProfessionColour(): string;
  isMounted(): boolean;
  getMountIcon(): string;
  /** Smoothly eases the view to keep the player centred until unsubscribed. */
  follow(setZoom?: boolean): Observable<unknown>;
}

// Live-marker MQTT protocol: the shapes the broker publishes. Pure data/enums
// (no Angular, no NgRx) so the OL live-markers layer can consume them without
// pulling in the store feature.

export interface LivePlayerData extends CharacterPositionUpdate, CharacterStateUpdate, CharacterMarkerInfo {}

export type MqttPayloadType = "UpsertCharacterMovement" | "UpdateCharacterState" | "DeleteCharacterData" | "UpdateCharacterKeepAlive";

export interface CharacterPositionUpdate {
  Type: MqttPayloadType;
  CharacterName: string;
  AccountName: string;
  ContinentId: number;
  MapId: number;
  MapPosition: Vector2;
  CharacterForward: Vector3;
}

export interface CharacterDeleteUpdate {
  Type: MqttPayloadType;
  CharacterName: string;
  AccountName: string;
}

export enum Mount {
  None,
  Jackal,
  Griffon,
  Springer,
  Skimmer,
  Raptor,
  RollerBeetle,
  Warclaw,
  Skyscale,
  Skiff,
  SiegeTurtle
}

export enum Profession {
  Unknown,
  Guardian,
  Warrior,
  Engineer,
  Ranger,
  Thief,
  Elementalist,
  Mesmer,
  Necromancer,
  Revenant
}

export interface CharacterStateUpdate {
  Type: MqttPayloadType;
  AccountName: string;
  CharacterName: string;
  ContinentId: number;
  MapId: number;
  ShardId: number;
  ServerConnectionInfo: string;
  BuildId: number;
  IsCommander: boolean;
  Mount: Mount;
  Profession: Profession;
  Specialisation: number;
}

export interface CharacterMarkerInfo {
  ReDraw: boolean | undefined;
  DeleteMarker: boolean | undefined;
  LastMessageTimestamp: number;
  Rotation: number;
  LatLng: PointTuple;
}

export interface Vector2 {
  X: number;
  Y: number;
}

export interface Vector3 {
  X: number;
  Y: number;
  Z: number;
}
