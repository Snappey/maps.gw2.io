import {MistsState} from "./mists/mists.feature";
import {GuildState} from "./guild/guild.feature";

export interface AppState {
  mists: MistsState
  guilds: GuildState
}
