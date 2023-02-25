import { Injectable } from '@angular/core';
import {Actions, createEffect, ofType} from "@ngrx/effects";
import {Store} from "@ngrx/store";
import {AppState} from "../appState";
import {settingsAction} from "../settings/settings.action";
import {catchError, concatMap, filter, map, mergeMap, of, switchMap, tap} from "rxjs";
import {AccountService} from "../../services/account.service";
import {userActions} from "./user.action";
import {GuildService} from "../../services/guild.service";
import {WvwService} from "../../services/wvw.service";

@Injectable()
export class UserEffects {

  hasApiKey$ = createEffect(() => this.actions$.pipe(
    ofType(settingsAction.setAll, settingsAction.loadCookieSuccess, settingsAction.setApiKey),
    filter(props => !!props.settings.apiKey),
    map(props => props.settings.apiKey!),
    switchMap((apiKey: string) => this.accountService.getAccountInfo(apiKey)),
    map(accountInfo => userActions.setUserData({ accountInfo })),
    catchError(async (error) => userActions.setUserDataError({ error }))
  ))

  loadGuilds$ = createEffect(() => this.actions$.pipe(
    ofType(userActions.setUserData),
    switchMap(s => of(...s.accountInfo.guilds)),
    mergeMap(guildId => this.guildService.getGuild(guildId), 2),
    map(guild => userActions.addUserGuild({ guild }))
  ))

  loadMatch$ = createEffect(() => this.actions$.pipe(
    ofType(userActions.setUserData),
    switchMap(s => this.wvwService.getMatchOverviewByWorldId(s.accountInfo.world)),
    map(matchDetails => userActions.addWvwMatchOverview({ matchDetails }))
  ))

  constructor(private actions$: Actions, private store: Store<AppState>, private accountService: AccountService, private guildService: GuildService, private wvwService: WvwService) {}
}
