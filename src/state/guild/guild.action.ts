import {createActionGroup, emptyProps, props} from "@ngrx/store";
import {Match, FullMatchObjective} from "../../services/wvw.service";
import {Guild, GuildUpgrade} from "../../services/guild.service";

export const guildActions = createActionGroup({
  source: 'guildActions',
  events: {
    Requested: () => emptyProps(),
    'Load Guild': props<{ guildId: string }>(),
    'Load Guild Success': props<{ guild: Guild }>(),
    'Load Guild Failed': props<{ error: string }>(),
    'Load Guild Upgrade': props<{ upgradeId: string }>(),
    'Load Guild Upgrade Success': props<{ upgrade: GuildUpgrade }>(),
    'Load Guild Upgrade Failed': props<{ error: string }>(),
  },
});
