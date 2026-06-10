import {CUSTOM_ELEMENTS_SCHEMA, NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {BrowserAnimationsModule} from "@angular/platform-browser/animations";
import {provideHttpClient, withInterceptorsFromDi} from "@angular/common/http";
import {RouterModule} from "@angular/router";
import {ToastrModule} from "ngx-toastr";
import {ClipboardModule} from "ngx-clipboard";
import {CookieModule} from "ngx-cookie";
import {NgcCookieConsentModule} from "ngx-cookieconsent";
import {IMqttServiceOptions, MqttModule} from "ngx-mqtt";
import {NgxGoogleAnalyticsModule, NgxGoogleAnalyticsRouterModule} from "ngx-google-analytics";
import {StoreModule} from "@ngrx/store";
import {EffectsModule} from "@ngrx/effects";
import {StoreDevtoolsModule} from "@ngrx/store-devtools";
import {providePrimeNG} from "primeng/config";
import Lara from "@primeuix/themes/lara";

import {HomeComponent} from './home/home.component';
import {ChromeModule} from "./chrome.module";
import {mistsFeature} from "../state/mists/mists.feature";
import {MistsEffects} from "../state/mists/mists.effects";
import {guildFeature} from "../state/guild/guild.feature";
import {GuildEffects} from "../state/guild/guild.effects";
import {settingsFeature} from "../state/settings/settings.feature";
import {SettingsEffects} from "../state/settings/settings.effects";
import {liveMarkersFeature} from "../state/live-markers/live-markers.feature";
import {LiveMarkersEffects} from "../state/live-markers/live-markers.effects";
import {userFeature} from "../state/user/user.feature";
import {UserEffects} from "../state/user/user.effects";

export const MQTT_SERVICE_OPTIONS: IMqttServiceOptions = {
  connectOnCreate: false,
};

@NgModule({
  declarations: [
    HomeComponent,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  bootstrap: [HomeComponent],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    ToastrModule.forRoot(),
    CookieModule.withOptions(),
    ClipboardModule,
    ChromeModule,

    MqttModule.forRoot(MQTT_SERVICE_OPTIONS),
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

    RouterModule.forRoot([
      {path: "tyria", loadComponent: () => import("./tyria-ol-map/tyria-ol-map.component").then(c => c.TyriaOlMapComponent)},
      {path: "tyria/:chatLink", loadComponent: () => import("./tyria-ol-map/tyria-ol-map.component").then(c => c.TyriaOlMapComponent)},
      {path: "wvw", loadComponent: () => import("./mists-ol-map/mists-ol-map.component").then(c => c.MistsOlMapComponent)},
      {path: "wvw/:id", loadComponent: () => import("./mists-ol-map/mists-ol-map.component").then(c => c.MistsOlMapComponent)},
      {path: "wvw/:id/:chatLink", loadComponent: () => import("./mists-ol-map/mists-ol-map.component").then(c => c.MistsOlMapComponent)},

      // The OL maps shipped on parallel routes before the cutover; keep old links
      // alive. pathMatch full, or the bare paths would prefix-match and drop params.
      {path: "tyria-next/:chatLink", redirectTo: "/tyria/:chatLink", pathMatch: "full"},
      {path: "tyria-next", redirectTo: "/tyria", pathMatch: "full"},
      {path: "wvw-next/:id/:chatLink", redirectTo: "/wvw/:id/:chatLink", pathMatch: "full"},
      {path: "wvw-next/:id", redirectTo: "/wvw/:id", pathMatch: "full"},
      {path: "wvw-next", redirectTo: "/wvw", pathMatch: "full"},

      {path: ":chatLink", redirectTo: "/tyria/:chatLink", pathMatch: "full"},
      {path: "**", redirectTo: "/tyria", pathMatch: "full"}
    ]),

    StoreModule.forRoot(),
    StoreModule.forFeature(settingsFeature),
    StoreModule.forFeature(userFeature),
    StoreModule.forFeature(mistsFeature),
    StoreModule.forFeature(guildFeature),
    StoreModule.forFeature(liveMarkersFeature),

    EffectsModule.forRoot([
      SettingsEffects,
      UserEffects,
      MistsEffects,
      GuildEffects,
      LiveMarkersEffects
    ]),

    StoreDevtoolsModule.instrument({
      maxAge: 25,
      logOnly: false,
      connectInZone: true
    }),

    NgxGoogleAnalyticsModule.forRoot('G-ZF8RV8P3LT'),
    NgxGoogleAnalyticsRouterModule,
  ],
  providers: [
    provideHttpClient(withInterceptorsFromDi()),
    providePrimeNG({
      theme: {
        preset: Lara,
        options: {
          darkModeSelector: false
        }
      }
    })
  ],
})
export class AppModule {
}
