import {createFeature, createReducer, createSelector, on} from '@ngrx/store';
import {liveMarkersActions} from "./live-markers.action";
import {AppState} from "../appState";
import {selectUserAccountName, selectUserRegion, selectUserWvwTeam} from "../user/user.feature";
import {ChannelType} from "../settings/settings.feature";

export interface LiveMarkersState {
  authToken: string;
  activeContinentId: 1 | 2;
}

const initialState: LiveMarkersState = {
  authToken: "",
  activeContinentId: 1,
};

export const liveMarkersFeature = createFeature({
  name: 'liveMarkers',
  reducer: createReducer(
    initialState,
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
  selectUserAccountName,
  (settings, continentId, region, teamDetails, accountName) => {
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
      case ChannelType.Solo:
        return `maps.gw2.io/solo/${accountName}/#`
      default:
        return undefined;
    }
  }
);

export const selectLiveMapEnabled = createSelector(
  (state: AppState) => state.settings.liveMapEnabled,
  (enabled) => enabled
);

export const {
  name, // feature name
} = liveMarkersFeature;
