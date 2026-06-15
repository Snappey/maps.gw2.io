// Config shared by every environment (dev + prod). The per-environment files
// only differ in the `production` flag, so the infra hosts live here once.
export const liveMarkers = {
  brokerUrl: "leyline.gw2.io",
  authUrl: "https://auth-leyline.gw2.io/auth",
};
