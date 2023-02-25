import { Injectable } from '@angular/core';
import {CookieService} from "ngx-cookie";
import {Actions, createEffect, ofType} from "@ngrx/effects";
import {mistsActions} from "../mists/mists.action";
import {catchError, combineLatestWith, EMPTY, map, of, switchMap} from "rxjs";
import {settingsAction} from "./settings.action";
import {World} from "../../services/wvw.service";
import {SettingsState} from "./settings.feature";
import {Store} from "@ngrx/store";
import {AppState} from "../appState";

@Injectable()
export class SettingsEffects {
  private SETTINGS_KEY = "gw2.io_Settings";

  loadCookie$ = createEffect(() => this.actions$.pipe(
    ofType(settingsAction.loadCookie),
    map(_ => {
      const state = this.cookieService.getObject(this.SETTINGS_KEY) as (SettingsState | undefined);
      return state !== undefined ?
        settingsAction.loadCookieSuccess({ settings: state }) :
        settingsAction.loadCookieFailed({ error: "failed to get cookie in expected structure" });
    })
  ));

  saveCookie$ = createEffect(() => this.actions$.pipe(
    ofType(settingsAction.setAll, settingsAction.setHomeWorld, settingsAction.setApiKey),
    combineLatestWith(this.store.select(s => s.settings)),
    map(([_, state]) => {
      this.cookieService.put(this.SETTINGS_KEY, JSON.stringify(state));
      return settingsAction.savedCookieSuccess();
    })
  ))

  constructor(private actions$: Actions, private store: Store<AppState>, private cookieService: CookieService) {}
}
