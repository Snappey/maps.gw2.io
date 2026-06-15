import {buildTacoLayers} from "./taco-import";
import {MapRectInfo} from "./taco-convert";
import {ParsedTaco} from "./taco-parse";

const maps = new Map<number, MapRectInfo>([
  [15, {continent_id: 1, map_rect: [[-43008, -27648], [43008, 30720]], continent_rect: [[42624, 28032], [46208, 30464]]}],
]);

function parsedFixture(): ParsedTaco {
  const categories = new Map([
    ["root", {displayName: "My Pack"}],
    ["root.queensdale", {displayName: "Queensdale"}],
    ["root.queensdale.nodes", {displayName: "Toggle Nodes", iconFile: "node.png"}],
    ["root.queensdale.trail", {displayName: "Toggle Trail"}],
  ]);
  return {
    pois: [
      {mapId: 15, x: 0, y: 0, z: 0, type: "root.queensdale.nodes"},
      {mapId: 15, x: 100, y: 0, z: 100, type: "root.queensdale.nodes"},
      {mapId: 15, x: 50, y: 0, z: 50, type: "root.queensdale.trail"},
    ],
    trails: [
      {mapId: 15, type: "root.queensdale.trail", color: "00ff00", points: [{x: 10, y: 0, z: 10}, {x: 20, y: 0, z: 20}]},
    ],
    categories,
  };
}

const noIcons = {sourceName: "test.taco", resolveIcon: () => undefined};

describe("buildTacoLayers", () => {
  it("creates one layer per category with a leaf name and ancestor group path", () => {
    const r = buildTacoLayers(parsedFixture(), maps, noIcons);
    expect(r.layers.length).toBe(2);
    expect(r.layers.map(l => l.name).sort()).toEqual(["Toggle Nodes", "Toggle Trail"]);
    expect(r.layers.every(l => JSON.stringify(l.group) === JSON.stringify(["My Pack", "Queensdale"]))).toBe(true);
  });

  it("groups POIs and trails into their own category layer", () => {
    const r = buildTacoLayers(parsedFixture(), maps, noIcons);
    const nodes = r.layers.find(l => l.name.includes("Nodes"))!;
    const trail = r.layers.find(l => l.name.includes("Trail"))!;
    expect(nodes.features.length).toBe(2);
    expect(nodes.features.every(f => f.geometry.type === "Point")).toBe(true);
    expect(trail.features.length).toBe(2); // 1 POI + 1 LineString segment
    expect(trail.features.some(f => f.geometry.type === "LineString")).toBe(true);
    expect(r.poiCount).toBe(3);
    expect(r.trailCount).toBe(1);
  });

  it("combines the map/resource group with a cleaned leaf as the marker tooltip", () => {
    const r = buildTacoLayers(parsedFixture(), maps, noIcons);
    const nodes = r.layers.find(l => l.name.includes("Nodes"))!;
    expect(nodes.features.every(f => f.name === "Queensdale — Nodes")).toBe(true);
  });

  it("resolves the category iconFile and the trail colour", () => {
    const r = buildTacoLayers(parsedFixture(), maps, {sourceName: "t", resolveIcon: p => (p ? `url:${p}` : undefined)});
    const nodes = r.layers.find(l => l.name.includes("Nodes"))!;
    const trail = r.layers.find(l => l.name.includes("Trail"))!;
    expect(nodes.features[0].icon).toBe("url:node.png");
    expect(trail.color).toBe("#00ff00");
  });

  it("marks every layer ephemeral and on the feature's continent", () => {
    const r = buildTacoLayers(parsedFixture(), maps, noIcons);
    expect(r.layers.every(l => l.ephemeral === true)).toBe(true);
    expect(r.layers.every(l => l.continentId === 1)).toBe(true);
  });

  it("counts features on unknown maps as skipped", () => {
    const p = parsedFixture();
    p.pois.push({mapId: 99999, x: 0, y: 0, z: 0, type: "root.queensdale.nodes"});
    const r = buildTacoLayers(p, maps, noIcons);
    expect(r.skippedUnknownMap).toBe(1);
    expect(r.poiCount).toBe(3);
  });
});
