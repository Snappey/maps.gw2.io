import { Injectable } from '@angular/core';
import {Actions, concatLatestFrom, createEffect, ofType} from '@ngrx/effects';
import {Store} from "@ngrx/store";
import {LiveMarkersService} from "../../services/live-markers.service";
import {liveMarkersActions} from "./live-markers.action";
import {combineLatestWith, filter, interval, map, of, switchMap, tap, timer, withLatestFrom} from "rxjs";
import {LiveMarker} from "../../lib/live-marker";
import {AppState} from "../appState";
import {LabelService} from "../../services/label.service";
import {selectUserAccountName} from "../user/user.feature";

@Injectable()
export class LiveMarkersEffects {
  private markers: { [accountId: string]: LiveMarker } = {};

  createPlayerMarker$ = createEffect(() => this.actions$.pipe(
    ofType(liveMarkersActions.upsertPlayerData),
    filter(data => !(data.data.AccountName in this.markers)),
    combineLatestWith(this.liveMarkerService.activeMapLayer$, this.store.select(selectUserAccountName)),
    tap(([playerData, activeMapLayer, accountName]) => console.log(playerData, activeMapLayer, accountName)),
    map(([playerData, activeMapLayer, accountName]) => {
      this.markers[playerData.data.AccountName] = new LiveMarker(
        activeMapLayer[0],
        activeMapLayer[1],
        this.store,
        this.labelService,
        playerData.data,
        playerData.data.AccountName === accountName);

      return liveMarkersActions.createdLivePlayerMarker({ accountName: playerData.data.AccountName })
    })
  ));

  updatePlayerMarkerPosition$ = createEffect(() => this.actions$.pipe(
    ofType(liveMarkersActions.upsertPlayerData),
    filter(msg => msg.data.AccountName in this.markers),
    tap(msg => this.markers[msg.data.AccountName].updatePosition(msg.data)),
    map(msg => liveMarkersActions.updateLivePlayerMarker({ accountName: msg.data.AccountName }))
  ));

  updatePlayerMarkerState$ = createEffect(() => this.actions$.pipe(
    ofType(liveMarkersActions.updatePlayerState),
    filter(msg => msg.data.AccountName in this.markers),
    tap(msg => this.markers[msg.data.AccountName].updateState(msg.data)),
    map(msg => liveMarkersActions.updateLivePlayerMarker({ accountName: msg.data.AccountName }))
  ));

  deletePlayerMarker$ = createEffect(() => this.actions$.pipe(
    ofType(liveMarkersActions.deletePlayerData),
    filter(msg => msg.accountName in this.markers),
    tap(msg => {
      this.markers[msg.accountName].Remove();
      delete this.markers[msg.accountName];
    }),
    map(msg => liveMarkersActions.deletedLivePlayerMarker({ accountName: msg.accountName }))
  ));

  keepAliveCheck$ = interval(20_000).pipe(
    switchMap(_ => this.liveMarkerService.livePlayerData$),
    switchMap(playerData => of(...playerData)),
    filter(data => Date.now() - data.LastMessageTimestamp > 40_000),
    map(data => liveMarkersActions.deletePlayerData({ accountName: data.AccountName }))
  ).subscribe(action => this.store.dispatch(action)) // Potential subscriber leak here... rip (problem for future)

  constructor(private actions$: Actions, private readonly store: Store<AppState>, private labelService: LabelService, private liveMarkerService: LiveMarkersService) {}
}
