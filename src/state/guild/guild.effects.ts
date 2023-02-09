import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import {catchError, concatMap, exhaustMap, map, mergeMap, of, tap} from 'rxjs';
import {GuildService} from "../../services/guild.service";
import {guildActions} from "./guild.action";

@Injectable()
export class GuildEffects {

  getGuild$ = createEffect(() => this.actions$.pipe(
    ofType(guildActions.loadGuild),
    mergeMap(({ guildId }) => this.guildService.getGuild(guildId).pipe(
      map(guild => guildActions.loadGuildSuccess({ guild })),
      catchError(error => of(guildActions.loadGuildFailed({ error })))
    ))
  ))

  getGuildUpgrade$ = createEffect(() => this.actions$.pipe(
    ofType(guildActions.loadGuildUpgrade),
    mergeMap(({ upgradeId }) => this.guildService.getGuildUpgrade(upgradeId).pipe(
      map(upgrade => guildActions.loadGuildUpgradeSuccess({upgrade})),
      catchError(error => of(guildActions.loadGuildUpgradeFailed({ error })))
    ))
  ))

  constructor(private actions$: Actions, private guildService: GuildService) {}
}
