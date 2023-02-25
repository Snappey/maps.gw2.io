import {createFeature, createReducer, createSelector, on} from '@ngrx/store';
import {liveMarkersActions, LivePlayerData} from "./live-markers.action";
import {AppState} from "../appState";
import {selectUserRegion, selectUserWvwTeam} from "../user/user.feature";
import {ChannelType} from "../settings/settings.feature";

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
    on(liveMarkersActions.clearPlayerData, (state) => {
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
          [props.data.CharacterName]: props.data,
        }
      }
    }),
    on(liveMarkersActions.deletePlayerData, (state, props) => {
      const newPlayers = {...state.players}
      delete newPlayers[props.characterName]

      return {
        ...state,
        players: {
          ...newPlayers
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
        return `maps.gw2.io/${settings.customChannel}/#`
      default:
        return undefined;
    }
  }
);

export const {
  name, // feature name
} = liveMarkersFeature;

