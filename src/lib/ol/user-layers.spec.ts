import {userLayerZIndex} from "./user-layers";
import {UserLayer} from "../../services/user-layer.service";

function layer(types: ("Point" | "LineString")[]): UserLayer {
  return {
    id: "user_x",
    name: "x",
    continentId: 1,
    color: "#ffffff",
    features: types.map(t => (t === "Point"
      ? {geometry: {type: "Point" as const, coordinates: [0, 0] as [number, number]}}
      : {geometry: {type: "LineString" as const, coordinates: [[0, 0], [1, 1]] as [number, number][]}})),
  };
}

describe("userLayerZIndex", () => {
  it("renders point-only (icon) layers above any layer containing a path", () => {
    const icons = userLayerZIndex(layer(["Point", "Point"]));
    const paths = userLayerZIndex(layer(["LineString"]));
    const mixed = userLayerZIndex(layer(["Point", "LineString"]));
    expect(icons).toBeGreaterThan(paths);
    expect(mixed).toBe(paths); // any path drops the whole layer to the path band
  });
});
