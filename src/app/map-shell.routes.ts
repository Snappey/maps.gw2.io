import {Routes} from "@angular/router";
import {importProvidersFrom} from "@angular/core";
import {IMqttServiceOptions, MqttModule, MqttService} from "ngx-mqtt";
import {provideState} from "@ngrx/store";
import {provideEffects} from "@ngrx/effects";

import {liveMarkersFeature} from "../state/live-markers/live-markers.feature";
import {LiveMarkersEffects} from "../state/live-markers/live-markers.effects";
import {LiveMarkersService} from "../services/live-markers.service";
import {mistsFeature} from "../state/mists/mists.feature";
import {MistsEffects} from "../state/mists/mists.effects";

const MQTT_SERVICE_OPTIONS: IMqttServiceOptions = {
  connectOnCreate: false,
};

// Per-route SEO metadata, consumed by Gw2TitleStrategy (see services/seo.service.ts).
// `canonicalPath` collapses the :chatLink / :id deep-link variants back onto the two
// canonical pages so marker links and "#lat,lng,zoom" pan state don't fork duplicates.
const TYRIA_TITLE = "Tyria Interactive Map – Waypoints, Vistas & POIs";
const TYRIA_DESCRIPTION =
  "Explore the Guild Wars 2 world map of Tyria – waypoints, vistas, points of interest, " +
  "hearts, mastery and skill points and live event timers, with shareable location links.";
const WVW_TITLE = "WvW Live Map – Real-Time Mists Match Overview";
const WVW_DESCRIPTION =
  "Real-time Guild Wars 2 World vs. World (WvW) map – live WvW match overviews, objective " +
  "ownership, scoring and a shareable, interactive battlefield view.";

const TYRIA_DATA = {description: TYRIA_DESCRIPTION, canonicalPath: "/tyria"};
const WVW_DATA = {description: WVW_DESCRIPTION, canonicalPath: "/wvw"};

/**
 * Lazily-loaded shell for the map routes. Both maps share the live-markers
 * feature (MQTT broker + state/effects), so it's provided here on a
 * componentless parent rather than at the app root. Loading it via
 * loadChildren keeps the heavy `mqtt-browser` client out of the initial
 * bundle — it ships in this route chunk, fetched after bootstrap. The WvW
 * (mists) feature is scoped one level deeper so it only loads on /wvw.
 */
export const MAP_SHELL_ROUTES: Routes = [
  {
    path: "",
    providers: [
      // forRoot only provides the config token; MqttService is providedIn:'root',
      // so without this explicit entry it instantiates at the root injector and
      // can't see the route-scoped config (NG0201). Pinning it here keeps the
      // service and its config in the same injector.
      importProvidersFrom(MqttModule.forRoot(MQTT_SERVICE_OPTIONS)),
      MqttService,
      provideState(liveMarkersFeature),
      provideEffects([LiveMarkersEffects]),
      LiveMarkersService,
    ],
    children: [
      {path: "tyria", title: TYRIA_TITLE, data: TYRIA_DATA, loadComponent: () => import("./tyria-ol-map/tyria-ol-map.component").then(c => c.TyriaOlMapComponent)},
      {path: "tyria/:chatLink", title: TYRIA_TITLE, data: TYRIA_DATA, loadComponent: () => import("./tyria-ol-map/tyria-ol-map.component").then(c => c.TyriaOlMapComponent)},
      {
        path: "wvw",
        providers: [
          provideState(mistsFeature),
          provideEffects([MistsEffects]),
        ],
        children: [
          {path: "", title: WVW_TITLE, data: WVW_DATA, loadComponent: () => import("./mists-ol-map/mists-ol-map.component").then(c => c.MistsOlMapComponent)},
          {path: ":id", title: WVW_TITLE, data: WVW_DATA, loadComponent: () => import("./mists-ol-map/mists-ol-map.component").then(c => c.MistsOlMapComponent)},
          {path: ":id/:chatLink", title: WVW_TITLE, data: WVW_DATA, loadComponent: () => import("./mists-ol-map/mists-ol-map.component").then(c => c.MistsOlMapComponent)},
        ],
      },

      // The OL maps shipped on parallel routes before the cutover; keep old links
      // alive. pathMatch full, or the bare paths would prefix-match and drop params.
      {path: "tyria-next/:chatLink", redirectTo: "/tyria/:chatLink", pathMatch: "full"},
      {path: "tyria-next", redirectTo: "/tyria", pathMatch: "full"},
      {path: "wvw-next/:id/:chatLink", redirectTo: "/wvw/:id/:chatLink", pathMatch: "full"},
      {path: "wvw-next/:id", redirectTo: "/wvw/:id", pathMatch: "full"},
      {path: "wvw-next", redirectTo: "/wvw", pathMatch: "full"},

      {path: ":chatLink", redirectTo: "/tyria/:chatLink", pathMatch: "full"},
      {path: "**", redirectTo: "/tyria", pathMatch: "full"},
    ],
  },
];
