import {ApplicationConfig, importProvidersFrom, provideZoneChangeDetection} from "@angular/core";
import {provideHttpClient, withInterceptorsFromDi} from "@angular/common/http";
import {provideRouter, TitleStrategy} from "@angular/router";
import {provideAnimations} from "@angular/platform-browser/animations";
import {ToastrModule} from "ngx-toastr";
import {ClipboardModule} from "ngx-clipboard";
import {CookieModule} from "ngx-cookie";
import {NgcCookieConsentModule} from "ngx-cookieconsent";
import {provideState, provideStore} from "@ngrx/store";
import {provideEffects} from "@ngrx/effects";
import {provideStoreDevtools} from "@ngrx/store-devtools";
import {providePrimeNG} from "primeng/config";

import {GW2Preset} from "../theme/gw2-preset";
import {environment} from "../environments/environment";
import {routes} from "./app.routes";
import {Gw2TitleStrategy} from "./services/seo.service";
import {settingsFeature} from "../state/settings/settings.feature";
import {SettingsEffects} from "../state/settings/settings.effects";
import {userFeature} from "../state/user/user.feature";
import {UserEffects} from "../state/user/user.effects";

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection(),
    provideAnimations(),
    provideHttpClient(withInterceptorsFromDi()),
    provideRouter(routes),
    {provide: TitleStrategy, useClass: Gw2TitleStrategy},

    provideStore(),
    provideState(settingsFeature),
    provideState(userFeature),
    provideEffects([SettingsEffects, UserEffects]),
    // Dev-only: keep @ngrx/store-devtools out of the production bundle so it can
    // tree-shake (it can't when statically wired into the prod provider graph).
    ...(environment.production ? [] : [provideStoreDevtools({maxAge: 25, logOnly: false, connectInZone: true})]),

    providePrimeNG({
      theme: {
        preset: GW2Preset,
        options: {
          darkModeSelector: false
        }
      }
    }),

    // Modules without a provide* equivalent: wrap their forRoot()/withOptions().
    importProvidersFrom(
      ToastrModule.forRoot(),
      CookieModule.withOptions(),
      ClipboardModule,
      NgcCookieConsentModule.forRoot({
        cookie: {
          domain: 'maps.gw2.io'
        },
        palette: {
          popup: {
            background: '#000'
          },
          button: {
            background: '#f1d600'
          }
        },
        theme: 'edgeless',
        position: "bottom",
        type: 'info'
      }),
    ),
  ],
};
