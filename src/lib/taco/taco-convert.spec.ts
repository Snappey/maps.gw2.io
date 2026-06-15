import {MapRectInfo, placePoi, placeTrail, worldToContinent} from "./taco-convert";

const F = 39.3701; // inches per metre

// Real values from https://api.guildwars2.com/v2/maps/15 (Queensdale).
const queensdale: MapRectInfo = {
  continent_id: 1,
  map_rect: [[-43008, -27648], [43008, 30720]],
  continent_rect: [[42624, 28032], [46208, 30464]],
};
// https://api.guildwars2.com/v2/maps/1343 (Bjora Marches).
const bjora: MapRectInfo = {
  continent_id: 1,
  map_rect: [[-52224, -24576], [55296, 27648]],
  continent_rect: [[54911, 16972], [59391, 19148]],
};
const maps = new Map<number, MapRectInfo>([[15, queensdale], [1343, bjora]]);

describe("worldToContinent", () => {
  it("maps the map centre to the continent_rect centre-x and the matching y", () => {
    const [x, y] = worldToContinent(0, 0, queensdale);
    expect(x).toBeCloseTo(44416, 3); // (42624 + 46208) / 2
    expect(y).toBeCloseTo(29312, 3);
  });

  it("applies the metre→inch scale and maps world corners to continent corners (Y inverted)", () => {
    const [[mnX, mnY], [mxX, mxY]] = queensdale.map_rect;
    // NW continent corner = min map X (west), max map Z (north)
    const nw = worldToContinent(mnX / F, mxY / F, queensdale);
    expect(nw[0]).toBeCloseTo(42624, 0);
    expect(nw[1]).toBeCloseTo(28032, 0); // top pixel (smaller pixel-Y)
    // SE continent corner = max map X (east), min map Z (south)
    const se = worldToContinent(mxX / F, mnY / F, queensdale);
    expect(se[0]).toBeCloseTo(46208, 0);
    expect(se[1]).toBeCloseTo(30464, 0); // bottom pixel (larger pixel-Y)
  });

  it("inverts the Z axis: a larger world Z (north) gives a smaller pixel-Y", () => {
    const north = worldToContinent(0, 100, queensdale)[1];
    const south = worldToContinent(0, -100, queensdale)[1];
    expect(north).toBeLessThan(south);
  });

  it("places real Bjora Marches nodes (metres) at their canonical continent pixels", () => {
    // Canonical GW2 conversion (verified against the live map); without the metre
    // scale these collapse together, and with a negated Z they mirror vertically.
    const a = worldToContinent(-171.706, 596.169, bjora);
    const b = worldToContinent(-18.6331, 70.7802, bjora);
    expect(a[0]).toBeCloseTo(56805, 0);
    expect(a[1]).toBeCloseTo(17146, 0);
    expect(b[0]).toBeCloseTo(57056, 0);
    expect(b[1]).toBeCloseTo(18008, 0);
    for (const p of [a, b]) {
      expect(p[0]).toBeGreaterThanOrEqual(54911);
      expect(p[0]).toBeLessThanOrEqual(59391);
      expect(p[1]).toBeGreaterThanOrEqual(16972);
      expect(p[1]).toBeLessThanOrEqual(19148);
    }
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(200);
  });
});

describe("placePoi / placeTrail", () => {
  it("returns the coord and continentId for a known map", () => {
    const placed = placePoi({mapId: 15, x: 0, y: 0, z: 0}, maps);
    expect(placed?.continentId).toBe(1);
    expect(placed?.coord[0]).toBeCloseTo(44416, 3);
  });

  it("converts every trail vertex", () => {
    const placed = placeTrail({mapId: 15, points: [{x: 0, y: 0, z: 0}, {x: 500, y: 0, z: -500}]}, maps);
    expect(placed?.points.length).toBe(2);
    expect(placed?.points[0]).not.toEqual(placed?.points[1]);
  });

  it("returns undefined for an unknown map", () => {
    expect(placePoi({mapId: 99999, x: 0, y: 0, z: 0}, maps)).toBeUndefined();
    expect(placeTrail({mapId: 99999, points: []}, maps)).toBeUndefined();
  });
});
