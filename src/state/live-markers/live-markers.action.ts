import {createActionGroup, emptyProps, props} from "@ngrx/store";
import {Match} from "../../services/wvw.service";

export const liveMarkersActions = createActionGroup({
  source: 'liveMarkers',
  events: {
    'Upsert Player Data': props<{ data: LivePlayerData }>(),
    'Delete Player Data': props<{ characterName: string }>(),
    'Clear Player Data': emptyProps(),
    'Set Auth Token': props<{ authToken: string }>(),
    'Clear Auth Token': emptyProps(),
    'Set Active Continent': props<{ continentId: 1 | 2}>()
  },
});

export interface MapPosition {
  X: number;
  Y: number;
}

export interface CharacterForward {
  X: number;
  Y: number;
  Z: number;
}

export interface LivePlayerData {
  Type: string;
  AccountName: string;
  CharacterName: string;
  ContinentId: number;
  MapId: number;
  MapPosition: MapPosition;
  CharacterForward: CharacterForward;
  WorldId: number;
  ShardId: number;
  ServerConnectionInfo: string;
  BuildId: number;
  IsCommander: boolean;
  Mount: number;
  Profession: number;
  Specialisation: number;
}
