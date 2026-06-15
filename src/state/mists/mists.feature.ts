import {createFeature, createReducer, createSelector, on} from '@ngrx/store';
import {Match} from "../../services/wvw.model";
import {AppState} from "../appState";
import {mistsActions} from "./mists.action";

export interface MistsState {
  loading: boolean
  updatingMatch: boolean
  matches: {[id: string]: Match}

  activeMatchId: string | null
  error: string
}

const initialState: MistsState = {
  loading: false,
  updatingMatch: false,
  matches: {},

  activeMatchId: null,
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
    on(mistsActions.updateMatch, (state) => {
      return {
        ...state,
        updatingMatch: true,
      }
    }),
    on(mistsActions.updateMatchSuccess, (state, {match}) => {
      return {
        ...state,
        matches: {  ...state.matches, [match.id]: match},
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

/**
 * The currently-viewed match, derived from the matches dictionary + the active
 * id (the update effect always refreshes `matches[activeMatchId]`), so it never
 * needs to be stored separately.
 */
export const selectActiveMatch = createSelector(
  (state: AppState) => state.mists.matches,
  (state: AppState) => state.mists.activeMatchId,
  (matches, activeMatchId) => (activeMatchId ? matches[activeMatchId] ?? null : null),
);

export const {
  name, // feature name
} = mistsFeature;
