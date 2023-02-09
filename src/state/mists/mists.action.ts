import {createActionGroup, emptyProps, props} from "@ngrx/store";
import {Match} from "../../services/wvw.service";

export const mistsActions = createActionGroup({
  source: 'mists',
  events: {
    'Load Matches': () => emptyProps(),
    'Load Matches Success': props<{ matches: Match[] }>(),
    'Load Matches Failed': props<{ error: string }>(),
    'Update Match Scores': emptyProps(),
    'Update Match Scores Success': props<{ matches: Match[] }>(),
    'Update Match Scores Failed': props<{ error: string }>(),
    'Set Active Match': props<{ matchId: string }>(),
    'Set Active World': props<{ worldId: string }>(),
    'Set Active World Failed': props<{ error: string }>(),
    'Update Match':  props<{ matchId: string }>(),
    'Update Match Success': props<{ match: Match }>(),
    'Update Match Failed': props<{ error: string}>()
  },
});
