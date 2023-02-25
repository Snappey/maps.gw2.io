import {MistsState} from "./mists/mists.feature";
import {GuildState} from "./guild/guild.feature";
import {LiveMarkersState} from "./live-markers/live-markers.feature";
import {SettingsState} from "./settings/settings.feature";
import {UserState} from "./user/user.feature";

export interface AppState {
  settings: SettingsState
  user: UserState
  mists: MistsState
  guilds: GuildState
  liveMarkers: LiveMarkersState
}
