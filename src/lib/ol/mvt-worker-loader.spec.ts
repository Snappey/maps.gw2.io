/**
 * Pins the worker<->main-thread boundary for off-thread MVT decode
 * (mvt-feature-transfer.ts) and the OL behavior the worker leans on. Both are
 * brittleness that would silently blank out marker tiles rather than throw:
 *   1. toRecord reads RenderFeature's PRIVATE fields (flatCoordinates_, ends_, ...)
 *      and fromRecord rebuilds via the public constructor — an OL rename or ctor
 *      signature change must fail CI, not ship.
 *   2. The worker decodes a tile with only its `extent` (no GW2 projection, no
 *      proj registry), trusting MVT/RenderFeature to derive the tile->world
 *      transform from the projection extents alone.
 */
import RenderFeature from "ol/render/Feature";
import Projection from "ol/proj/Projection";
import {fromRecord, toRecord} from "./mvt-feature-transfer";

describe("mvt-feature-transfer boundary", () => {
  // One feature per geometry kind the marker source actually carries: icon points,
  // the odd line, and sector/heart polygons.
  const cases = [
    {name: "Point", feature: new RenderFeature("Point", [100, 200], [2], 2, {layer: "waypoint", name: "WP"}, 7)},
    {name: "LineString", feature: new RenderFeature("LineString", [10, 10, 20, 40, 30, 10], [6], 2, {layer: "road"}, 8)},
    {name: "Polygon", feature: new RenderFeature("Polygon", [0, 0, 40, 0, 40, 40, 0, 40, 0, 0], [10], 2, {layer: "sector_bounds"}, 9)},
  ];

  for (const {name, feature} of cases) {
    it(`round-trips a ${name} feature through toRecord -> fromRecord`, () => {
      const rebuilt = fromRecord(toRecord(feature));
      expect(rebuilt.getType()).toBe(feature.getType());
      expect(Array.from(rebuilt.getFlatCoordinates())).toEqual(Array.from(feature.getFlatCoordinates()));
      expect(rebuilt.getEnds()).toEqual(feature.getEnds());
      expect(rebuilt.getId()).toBe(feature.getId());
      expect(rebuilt.getStride()).toBe(2);
    });
  }

  it("preserves every feature property (the style/tooltip/hit-test surface)", () => {
    const rebuilt = fromRecord(toRecord(cases[0].feature));
    expect(rebuilt.get("layer")).toBe("waypoint");
    expect(rebuilt.get("name")).toBe("WP");
  });

  it("transfers flat coordinates as a detachable Float64Array buffer", () => {
    const record = toRecord(cases[0].feature);
    expect(record.flat).toEqual(jasmine.any(Float64Array));
    expect(Array.from(record.flat)).toEqual([100, 200]);
  });

  it("rebuilds flat coordinates as a mutable plain array", () => {
    // The renderer's simplify path does `flatCoordinates.length = n`, which throws
    // on a typed array — so fromRecord must hand back a plain Array even though the
    // worker transferred a Float64Array. This guards that design choice.
    const rebuilt = fromRecord(toRecord(cases[1].feature)) as unknown as {flatCoordinates_: number[]};
    expect(Array.isArray(rebuilt.flatCoordinates_)).toBe(true);
    expect(() => (rebuilt.flatCoordinates_.length = 2)).not.toThrow();
  });
});

describe("MVT self-contained tile->world transform", () => {
  it("derives world coordinates from the projection extents alone (no proj registry)", () => {
    // Mirrors MVT.readFeatures internals: a throwaway tile-pixels projection whose
    // extent is the MVT layer extent (4096) and worldExtent is the tile's world
    // extent. This is exactly what lets the worker decode with only the tile
    // `extent` — if OL ever needs the registered feature projection here, the
    // worker (which has neither) would produce wrong coordinates.
    const dataProjection = new Projection({code: "", units: "tile-pixels"});
    dataProjection.setExtent([0, 0, 4096, 4096]);
    dataProjection.setWorldExtent([0, -512, 512, 0]); // a 512px tile anchored at the world origin
    const feature = new RenderFeature("Point", [2048, 2048], [2], 2, {}, 1);

    feature.transform(dataProjection);

    // tile centre -> world: x = 0 + (512/4096)*2048 = 256; y = 0 - (512/4096)*2048 = -256
    expect(Array.from(feature.getFlatCoordinates())).toEqual([256, -256]);
  });
});
