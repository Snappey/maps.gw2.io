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
  lastMatchId: string | undefined;

  liveMapEnabled: boolean;
  selectedChannel: ChannelType;
  guildChannel: string | undefined;
  customChannel: string | undefined;
}

const initialState: SettingsState = {
  apiKey: undefined,
  lastMatchId: undefined,

  liveMapEnabled: false,
  selectedChannel: ChannelType.Global,
  guildChannel: undefined,
  customChannel: undefined
};

export const settingsFeature = createFeature({
  name: 'settings',
  reducer: createReducer(
    initialState,
    // Merge, don't replace: the settings form has no lastMatchId control.
    on(settingsAction.setAll, (state, props) => {
      return {
        ...state,
        ...props.settings,
      }
    }),
    on(settingsAction.setApiKey, (state, props) => {
      return {
        ...state,
        apiKey: props.settings.apiKey
      }
    }),
    on(settingsAction.setLastMatch, (state, props) => {
      return state.lastMatchId === props.matchId ? state : {
        ...state,
        lastMatchId: props.matchId
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
  name,
} = settingsFeature;
