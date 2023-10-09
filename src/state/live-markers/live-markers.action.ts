import {createActionGroup, emptyProps, props} from "@ngrx/store";

export const liveMarkersActions = createActionGroup({
  source: 'liveMarkers',
  events: {
    'Set Auth Token': props<{ authToken: string }>(),
    'Clear Auth Token': emptyProps(),
    'Set Active Continent': props<{ continentId: 1 | 2}>(),
  },
});
