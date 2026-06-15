import {localIconSrc} from "./marker-styles";

// localIconSrc MUST stay byte-identical to the sanitiser in
// scripts/download_city_icons.mjs — both do
// decodeURIComponent(name).replace(/[^A-Za-z0-9._-]/g, "_") — or wiki-hosted
// city icons 404 silently. These tests pin that contract.
describe("localIconSrc", () => {
  it("rewrites wiki image URLs to the local cached copy", () => {
    expect(localIconSrc("https://wiki.guildwars2.com/images/Black_Citadel.png"))
      .toBe("assets/city_icons/Black_Citadel.png");
  });

  it("URL-decodes then sanitises non [A-Za-z0-9._-] characters to underscores", () => {
    expect(localIconSrc("https://wiki.guildwars2.com/images/Fort%20Marriner.png"))
      .toBe("assets/city_icons/Fort_Marriner.png");
    expect(localIconSrc("https://wiki.guildwars2.com/images/Lion%27s_Arch.png"))
      .toBe("assets/city_icons/Lion_s_Arch.png");
  });

  it("leaves non-wiki URLs untouched", () => {
    expect(localIconSrc("assets/waypoint.png")).toBe("assets/waypoint.png");
    expect(localIconSrc("https://render.guildwars2.com/file/abc.png"))
      .toBe("https://render.guildwars2.com/file/abc.png");
  });
});
