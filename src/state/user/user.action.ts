import {createActionGroup, props} from "@ngrx/store";
import {AccountInfo} from "../../services/account.service";
import {Guild} from "../../services/guild.service";
import {MatchOverview} from "../../services/wvw.service";

export const userActions = createActionGroup({
  source: 'userActions',
  events: {
    'Set User Data': props<{ accountInfo: AccountInfo }>(),
    'Set User Data Error': props<{ error: string }>(),
    'Add User Guild': props<{ guild: Guild }>(),
    'Add User Guild Error': props<{ id: string, error: string }>(),
    'Add WvW Match Overview': props<{ matchDetails: MatchOverview }>(),
  },
});
