import {createActionGroup, emptyProps, props} from "@ngrx/store";
import {ChannelType, SettingsState} from "./settings.feature";

export const settingsAction = createActionGroup({
  source: 'settingsAction',
  events: {
    'Load Cookie': emptyProps(),
    'Load Cookie Success': props<{ settings: SettingsState }>(),
    'Load Cookie Failed': props<{error: string}>(),
    'Saved Cookie Success': emptyProps(),
    'Saved Cookie Failed': props<{error: string}>(),
    'Set All': props<{ settings: SettingsState }>(),
    'Set Last Match': props<{ matchId: string }>(),
    'Set Api Key': props<{ settings: { apiKey: string } }>(),
    'Set Live Map Channel': props<{ channelType: ChannelType }>()
  },
});
