import {Injectable} from '@angular/core';
import {CookieService} from "ngx-cookie";
import {Actions, createEffect, ofType} from "@ngrx/effects";
import {map, withLatestFrom} from "rxjs";
import {settingsAction} from "./settings.action";
import {SettingsState} from "./settings.feature";
import {Store} from "@ngrx/store";
import {AppState} from "../appState";
import {mistsActions} from "../mists/mists.action";

@Injectable()
export class SettingsEffects {
  private SETTINGS_KEY = "gw2.io_Settings";

  loadCookie$ = createEffect(() => this.actions$.pipe(
    ofType(settingsAction.loadCookie),
    map(_ => {
      const state = this.cookieService.getObject(this.SETTINGS_KEY) as ((SettingsState & {homeWorld?: string}) | undefined);
      if (state === undefined) {
        return settingsAction.loadCookieFailed({ error: "failed to get cookie in expected structure" });
      }
      delete state.homeWorld; // stale key from before WvW removed home worlds
      return settingsAction.loadCookieSuccess({ settings: state });
    })
  ));

  saveCookie$ = createEffect(() => this.actions$.pipe(
    ofType(settingsAction.setAll, settingsAction.setLastMatch, settingsAction.setApiKey),
    withLatestFrom(this.store.select(s => s.settings)),
    map(([_, state]) => {
      this.cookieService.put(this.SETTINGS_KEY, JSON.stringify(state));
      return settingsAction.savedCookieSuccess();
    })
  ))

  // Remember the last viewed match so /wvw can restore it next visit.
  persistLastMatch$ = createEffect(() => this.actions$.pipe(
    ofType(mistsActions.setActiveMatch),
    map(({matchId}) => settingsAction.setLastMatch({ matchId }))
  ))

  constructor(private actions$: Actions, private store: Store<AppState>, private cookieService: CookieService) {}
}
