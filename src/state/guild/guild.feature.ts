import {createFeature, createReducer, on} from '@ngrx/store';
import {Guild, GuildUpgrade} from "../../services/guild.service";
import {guildActions} from "./guild.action";

export interface GuildState {
  loading: boolean;
  guilds: {[guildId: string]: Guild}
  guildUpgrades: {[upgradeId: string]: GuildUpgrade[]}
  errors: string[],
}

const initialState: GuildState = {
  loading: false,
  guilds: {},
  guildUpgrades: {},
  errors: []
};

export const guildFeature = createFeature({
  name: 'guilds',
  reducer: createReducer(
    initialState,
    on(guildActions.requested, (state) => {
      return{
        ...state
      }
    }),
    on(guildActions.loadGuildSuccess, (state, { guild }) => {
      return {
        ...state,
        guilds: { ...state.guilds, [guild.id]: guild }
      }
    }),
    on(guildActions.loadGuildFailed, (state, { error }) => {
      return {
        ...state,
        errors: [...state.errors, error]
      }
    }),
    on(guildActions.loadGuildUpgradeSuccess, (state, { upgrade }) => {
      return {
        ...state,
        guildUpgrades: { ...state.guildUpgrades, [upgrade.id]: upgrade }
      }
    }),
    on(guildActions.loadGuildUpgradeFailed, (state, { error }) => {
      return {
        ...state,
        errors: [...state.errors, error]
      }
    })
  )
});

export const {
  name, // feature name
} = guildFeature;
