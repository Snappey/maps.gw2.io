import {createFeature, createReducer, on} from '@ngrx/store';
import {settingsAction} from "./settings.action";

export enum ChannelType {
  Global = "Global",
  Guild = "Guild",
  Custom = "Custom",
  Solo = "Solo"
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
