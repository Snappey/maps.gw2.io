import {Injectable} from '@angular/core';
import {Actions, createEffect, ofType} from '@ngrx/effects';
import {catchError, map, of, switchMap, tap} from 'rxjs';
import {WvwService} from "../../services/wvw.service";
import {mistsActions} from "./mists.action";
import {Store} from "@ngrx/store";
import {Router} from "@angular/router";

@Injectable()
export class MistsEffects {

  loadMatches$ = createEffect(() => this.actions$.pipe(
    ofType(mistsActions.loadMatches),
    switchMap((_) => this.wvwService.getAllMatchDetails().pipe(
      map(matches => mistsActions.loadMatchesSuccess({ matches })),
      catchError(error => of(mistsActions.loadMatchesFailed({ error })))
    ))
  ))

  updateActiveMatch$ = createEffect(() => this.actions$.pipe(
    ofType(mistsActions.updateMatch, mistsActions.setActiveMatch),
    switchMap(props => this.wvwService.getMatchDetails(props.matchId).pipe(
      tap(match => this.router.navigate(["wvw", match.id], {skipLocationChange: true})),
      map(match => mistsActions.updateMatchSuccess({ match })),
      catchError(error => of(mistsActions.updateMatchFailed({ error })))
    ))
  ))

  setActiveMatchByWorld$ = createEffect(() => this.actions$.pipe(
    ofType(mistsActions.setActiveWorld),
    switchMap(props => this.wvwService.getMatchDetailsByWorldId(props.worldId).pipe(
      tap(match => this.router.navigate(["wvw", match.id], {skipLocationChange: true})),
      map(match => mistsActions.setActiveMatch({ matchId: match.id })),
      catchError(error => of(mistsActions.setActiveWorldFailed({ error })))
    ))
  ))

  constructor(private actions$: Actions, private wvwService: WvwService, private readonly store: Store, private router: Router) {}
}
