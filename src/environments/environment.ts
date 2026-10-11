// `ng build` swaps this for environment.prod.ts via fileReplacements in angular.json.

import {liveMarkers} from "./shared";

export const environment = {
  production: false,
  liveMarkers,
  // Bunny-backed, 4 subdomains. Rollback: "https://tiles{1-4}.gw2.io" (CloudFront, still live).
  tyriaTileHost: "https://btiles{1-4}.gw2.io",
};

// Uncomment in dev only to hide zone.js frames from error stack traces; hurts perf in prod.
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
