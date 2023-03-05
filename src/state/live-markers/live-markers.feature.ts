import {createFeature, createReducer, createSelector, on} from '@ngrx/store';
import {liveMarkersActions} from "./live-markers.action";
import {AppState} from "../appState";
import {selectUserRegion, selectUserWvwTeam} from "../user/user.feature";
import {ChannelType} from "../settings/settings.feature";
import {PointTuple} from "leaflet";

export interface LiveMarkersState {
  players: { [id: string]: LivePlayerData };
  authToken: string;
  activeContinentId: 1 | 2;
}

const initialState: LiveMarkersState = {
  players: {},
  authToken: "",
  activeContinentId: 1,
};

export const liveMarkersFeature = createFeature({
  name: 'liveMarkers',
  reducer: createReducer(
    initialState,
    on(liveMarkersActions.clearAllPlayerData, (state) => {
      return {
        ...state,
        players: {}
      }
    }),
    on(liveMarkersActions.upsertPlayerData, (state, props) => {
      return {
        ...state,
        players: {
          ...state.players,
          [props.data.AccountName]: {
            ...state.players[props.data.AccountName],
            ...props.data,

            LastMessageTimestamp: Date.now()
          },
        }
      }
    }),
    on(liveMarkersActions.updatePlayerState, (state, props) => {
      return {
        ...state,
        players: {
          ...state.players,
          [props.data.AccountName]: {
            ...state.players[props.data.AccountName],
            ...props.data,

            LastMessageTimestamp: Date.now(),
            ReDraw: true
          }
        }
      }
    }),
    on(liveMarkersActions.deletePlayerData, (state, props) => {
      const newPlayers = {...state.players}
      delete newPlayers[props.accountName]

      return {
        ...state,
        players: {
          ...newPlayers
        }
      }
    }),
    on(liveMarkersActions.updatePlayerKeepalive, (state, props) => {
      return {
        ...state,
        players: {
          ...state.players,
          [props.accountName]: {
            ...state.players[props.accountName],
            LastMessageTimestamp: Date.now()
          }
        }
      }
    }),
    on(liveMarkersActions.setAuthToken, (state, props) => {
      return {
        ...state,
        authToken: props.authToken
      }
    }),
    on(liveMarkersActions.clearAuthToken, (state) => {
      return {
        ...state,
        authToken: ""
      }
    }),
    on(liveMarkersActions.setActiveContinent, (state, props) => {
      return {
        ...state,
        activeContinentId: props.continentId
      }
    })
  ),
});

export const selectUserWithAuthToken = createSelector(
  (state: AppState) => state.user.name,
  (state: AppState) => state.liveMarkers.authToken,
  (user, authToken) => {
    return {user, authToken};
  }
);

export const selectUserTopic = createSelector(
  (state: AppState) => state.settings,
  (state: AppState) => state.liveMarkers.activeContinentId,
  selectUserRegion,
  selectUserWvwTeam,
  (settings, continentId, region, teamDetails) => {
    if (teamDetails === undefined) {
      return undefined;
    }

    switch(settings.selectedChannel) {
      case ChannelType.Global:
        return continentId === 1 ?
          `maps.gw2.io/global/${continentId}/${region}/#` :
          `maps.gw2.io/global/${continentId}/${teamDetails.matchId}/${teamDetails.team}/#`
      case ChannelType.Guild:
        return `maps.gw2.io/guild/${settings.guildChannel}/#`
      case ChannelType.Custom:
        return `maps.gw2.io/custom/${settings.customChannel}/#`
      default:
        return undefined;
    }
  }
);

export const selectUserData = (AccountName: string) => createSelector(
  (state: AppState) => state.liveMarkers.players[AccountName] ?? undefined,
  (data) => data
)

export const {
  name, // feature name
} = liveMarkersFeature;


export interface LivePlayerData extends CharacterPositionUpdate, CharacterStateUpdate, CharacterMarkerInfo {}

export interface CharacterPositionUpdate {
  Type: string;
  CharacterName: string;
  AccountName: string;
  ContinentId: number;
  MapId: number;
  MapPosition: Vector2;
  CharacterForward: Vector3;
}

export interface CharacterDeleteUpdate {
  Type: string;
  CharacterName: string;
  AccountName: string;
}

export interface CharacterStateUpdate {
  Type: string;
  AccountName: string;
  CharacterName: string;
  ContinentId: number;
  MapId: number;
  ShardId: number;
  ServerConnectionInfo: string;
  BuildId: number;
  IsCommander: boolean;
  Mount: number;
  Profession: number;
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

const mountIcons: {[i: number]: string} = {
  1: "/assets/jackal_icon.png",
  2: "/assets/griffon_icon.png",
  3: "/assets/springer_icon.png",
  4: "/assets/skimmer_icon.png",
  5: "/assets/raptor_icon.png",
  6: "/assets/beetle_icon.png",
  7: "/assets/warclaw_icon.png",
  8: "/assets/skyscale_icon.png",
  9: "/assets/skiff_icon.png",
  10: "/assets/turtle_icon.png"
}
