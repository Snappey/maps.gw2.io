import {createFeature, createReducer, createSelector, on} from '@ngrx/store';
import {Guild, GuildUpgrade} from "../../services/guild.service";
import {settingsAction} from "./settings.action";
import {World} from "../../services/wvw.service";
import {UserState} from "../user/user.feature";
import {AppState} from "../appState";

export enum ChannelType {
  Global = "Global",
  Guild = "Guild",
  Custom = "Custom"
}

export interface SettingsState {
  apiKey: string | undefined;
  homeWorld: string | undefined;

  liveMapEnabled: boolean;
  selectedChannel: ChannelType;
  guildChannel: string | undefined;
  customChannel: string | undefined;
}

const initialState: SettingsState = {
  apiKey: undefined,
  homeWorld: undefined,

  liveMapEnabled: false,
  selectedChannel: ChannelType.Global,
  guildChannel: undefined,
  customChannel: undefined
};

export const settingsFeature = createFeature({
  name: 'settings',
  reducer: createReducer(
    initialState,
    on(settingsAction.setAll, (state, props) => {
      return {
        ...props.settings,
      }
    }),
    on(settingsAction.setApiKey, (state, props) => {
      return {
        ...state,
        apiKey: props.settings.apiKey
      }
    }),
    on(settingsAction.setHomeWorld, (state, props) => {
      return {
        ...state,
        homeWorld: props.world.id
      }
    }),
    on(settingsAction.loadCookieSuccess, (state, props) => {
      return {
        ...state,
        ...props.settings,
      }
    }),
    on(settingsAction.setLiveMapChannel, (state, props) => {
      return {
        ...state,
        selectedChannel: props.channelType
      }
    })
  )
});

export const {
  name, // feature name
} = settingsFeature;
