import {
  createTileGrid,
  fragmentToView,
  getExtent,
  getResolutions,
  gw2ToOl,
  olToGw2,
  TYRIA_MAP_CONFIG,
  MISTS_MAP_CONFIG,
  viewToFragment,
} from "./gw2-projection";

describe("gw2-projection", () => {
  it("round-trips GW2 <-> OL coordinates", () => {
    const gw2: [number, number] = [46720, 33280];
    expect(gw2ToOl(gw2)).toEqual([46720, -33280]);
    expect(olToGw2(gw2ToOl(gw2))).toEqual(gw2);
  });

  it("uses resolutions 2^(maxZoom-z) so OL zoom == Leaflet zoom", () => {
    expect(getResolutions(TYRIA_MAP_CONFIG)).toEqual([128, 64, 32, 16, 8, 4, 2, 1]);
    // Mists coordinates are scaled to zoom 7 even though native tiles stop at 6.
    expect(getResolutions(MISTS_MAP_CONFIG)).toEqual([128, 64, 32, 16, 8, 4, 2, 1]);
  });

  it("stops the mists raster grid at the native zoom 6 pyramid (32x32 tiles)", () => {
    const grid = createTileGrid(MISTS_MAP_CONFIG);
    expect(grid.getResolutions().length).toBe(7); // z0..6
    // EB center pixel (10600, 12750): tile span at z6 = 512 px -> (20, 24),
    // verified against live tiles.guildwars2.com/2/1/6/20/24.jpg.
    expect(grid.getTileCoordForCoordAndZ(gw2ToOl([10600, 12750]), 6)).toEqual([6, 20, 24]);
  });

  it("matches the Leaflet CRS.Simple fragment math (lat=-y/128, lng=x/128)", () => {
    // Leaflet default view for Tyria: latLng(-260, 365) zoom 3 == pixel (46720, 33280)
    const view = fragmentToView("-260,365,3", TYRIA_MAP_CONFIG)!;
    expect(view.center).toEqual([46720, -33280]);
    expect(view.zoom).toBe(3);

    expect(viewToFragment([46720, -33280], 3, TYRIA_MAP_CONFIG)).toBe("-260,365,3");
  });

  it("round-trips fragments including fractional Leaflet centers", () => {
    const view = fragmentToView("-260.5,365.25,5", TYRIA_MAP_CONFIG)!;
    expect(olToGw2(view.center)).toEqual([365.25 * 128, 260.5 * 128]);
    // Math.round rounds half toward +Infinity: -260.5 -> -260
    expect(viewToFragment(view.center, view.zoom, TYRIA_MAP_CONFIG)).toBe("-260,365,5");
  });

  it("rejects malformed fragments", () => {
    expect(fragmentToView("not,a,fragment", TYRIA_MAP_CONFIG)).toBeUndefined();
    expect(fragmentToView("1,2", TYRIA_MAP_CONFIG)).toBeUndefined();
  });

  it("builds a tile grid addressing tiles exactly like the GW2 raster scheme", () => {
    const grid = createTileGrid(TYRIA_MAP_CONFIG);
    expect(grid.getTileSize(0)).toBe(256);

    // World origin (top-left) must be tile (0,0) at every zoom.
    expect(grid.getTileCoordForCoordAndZ([0.5, -0.5], 7)).toEqual([7, 0, 0]);
    expect(grid.getTileCoordForCoordAndZ([0.5, -0.5], 2)).toEqual([2, 0, 0]);

    // At max zoom 1 unit == 1 px, 256px tiles: pixel (46720, 33280) -> tile (182, 130).
    expect(grid.getTileCoordForCoordAndZ(gw2ToOl([46720, 33280]), 7)).toEqual([7, 182, 130]);

    // Same pixel at zoom 5 (resolution 4): tile span 1024px -> (45, 32).
    expect(grid.getTileCoordForCoordAndZ(gw2ToOl([46720, 33280]), 5)).toEqual([5, 45, 32]);
  });

  it("clamps the extent to the world so edge tiles outside the map are not addressed", () => {
    const extent = getExtent(TYRIA_MAP_CONFIG);
    expect(extent).toEqual([0, -114688, 81920, 0]);

    const grid = createTileGrid(TYRIA_MAP_CONFIG);
    // 81920x114688 at zoom 7 = 320x448 tiles -> max indices 319/447.
    const range = grid.getTileRangeForExtentAndZ(extent, 7);
    expect(range.minX).toBe(0);
    expect(range.maxX).toBe(319);
    expect(range.minY).toBe(0);
    expect(range.maxY).toBe(447);
  });
});
