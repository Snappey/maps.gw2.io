// `ng build` swaps this for environment.prod.ts via fileReplacements in angular.json.

import {liveMarkers} from "./shared";

export const environment = {
  production: false,
  liveMarkers,
};

// Uncomment in dev only to hide zone.js frames from error stack traces; hurts perf in prod.
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
