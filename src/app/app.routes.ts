import {Routes} from "@angular/router";

// The map routes live behind a lazy boundary (map-shell.routes.ts) so the
// live-markers MQTT client doesn't weigh down the initial bundle. provideRouter
// statically imports this file, so anything referenced here ships eagerly —
// keep it to the loadChildren shim only.
export const routes: Routes = [
  {path: "", loadChildren: () => import("./map-shell.routes").then(m => m.MAP_SHELL_ROUTES)},
];
