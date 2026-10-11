import {liveMarkers} from "./shared";

export const environment = {
  production: true,
  liveMarkers,
  // Bunny-backed, 4 subdomains. Rollback: "https://tiles{1-4}.gw2.io" (CloudFront, still live).
  tyriaTileHost: "https://btiles{1-4}.gw2.io",
};
