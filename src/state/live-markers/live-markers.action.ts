import {createActionGroup, emptyProps, props} from "@ngrx/store";
import {CharacterPositionUpdate, CharacterStateUpdate} from "./live-markers.feature";

export const liveMarkersActions = createActionGroup({
  source: 'liveMarkers',
  events: {
    'Upsert Player Data': props<{ data: CharacterPositionUpdate }>(),
    'Update Player State': props<{ data: CharacterStateUpdate }>(),
    'Update Player KeepAlive': props<{ accountName: string }>(),
    'Delete Player Data': props<{ accountName: string }>(),
    'Clear All Player Data': emptyProps(),
    'Set Auth Token': props<{ authToken: string }>(),
    'Clear Auth Token': emptyProps(),
    'Set Active Continent': props<{ continentId: 1 | 2}>(),

    'Created Live Player Marker': props<{ accountName: string }>(),
    'Update Live Player Marker': props<{ accountName: string }>(),
    'Deleted Live Player Marker': props<{ accountName: string }>()
  },
});
