import {createFeature, createReducer, createSelector, on} from '@ngrx/store';
import {Match, MergedObjective, Objective} from "../../services/wvw.service";
import {mistsActions} from "./mists.action";
import {FeatureGroup,Map} from "leaflet";

export interface MistsState {
  loading: boolean
  updatingMatch: boolean
  matches: {[id: string]: Match}
  objectives: Objective[]

  activeMatchId: string | null
  activeMatch: Match | null
  error: string
}

const initialState: MistsState = {
  loading: false,
  updatingMatch: false,
  matches: {},
  objectives: [],

  activeMatchId: null,
  activeMatch: null,
  error: ""
};

export const mistsFeature = createFeature({
  name: 'mists',
  reducer: createReducer(
    initialState,
    on(mistsActions.loadMatches, (state) => {
      return {
        ...state,
        loading: true,
      }
    }),
    on(mistsActions.loadMatchesSuccess, (state, { matches }) => {
      return {
        ...state,
        loading: false,
        matches: matches.reduce((m: {[id: string]: Match}, c) => {
          m[c.id] = c
          return m
        }, {})
      }
    }),
    on(mistsActions.loadMatchesFailed, (state, { error }) => {
      return {
        ...state,
        loading: false,
        error
      }
    }),
    on(mistsActions.setActiveMatch, (state, { matchId }) => {
      return {
        ...state,
        activeMatchId: matchId,
        updatingMatch: true,
      }
    }),
    on(mistsActions.setActiveWorldFailed, (state, { error }) => {
      return {
        ...state,
        error
      }
    }),
    on(mistsActions.updateMatch, (state, {matchId}) => {
      return {
        ...state,
        updatingMatch: true,
      }
    }),
    on(mistsActions.updateMatchSuccess, (state, {match}) => {
      return {
        ...state,
        matches: {  ...state.matches, [match.id]: match},
        activeMatch: match,
        updatingMatch: false,
      }
    }),
    on(mistsActions.updateMatchFailed, (state, { error }) => {
      return {
        ...state,
        error,
        updatingMatch: false,
      }
    })
  ),
});

export const {
  name, // feature name
} = mistsFeature;
