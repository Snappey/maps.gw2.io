import {DEFAULT_FLOOR, findDominantMap, resolveFloor} from "./floor-lookup";
import {MapFloorInfo} from "../../services/map.service";

const mapInfo = (over: Partial<MapFloorInfo>): MapFloorInfo => ({
  id: 0,
  name: "",
  continent_id: 1,
  default_floor: 1,
  floors: [1],
  continent_rect: [[0, 0], [100, 100]],
  map_rect: [[0, 0], [100, 100]],
  ...over,
});

describe("floor-lookup", () => {
  describe("findDominantMap", () => {
    // continent_rect from the live API: Queensdale [[42624,28032],[46208,30464]].
    const queensdale = mapInfo({
      id: 15, name: "Queensdale", continent_id: 1,
      floors: [0, 1, 2, 3, 65], continent_rect: [[42624, 28032], [46208, 30464]],
    });

    it("returns the map the viewport sits inside", () => {
      expect(findDominantMap([queensdale], 1, [43000, 28500, 45000, 30000])?.id).toBe(15);
    });

    it("returns undefined when the viewport overlaps no rect", () => {
      expect(findDominantMap([queensdale], 1, [0, 0, 100, 100])).toBeUndefined();
    });

    it("ignores maps on other continents", () => {
      const ebg = mapInfo({id: 38, continent_id: 2, continent_rect: [[0, 0], [100000, 100000]]});
      expect(findDominantMap([queensdale, ebg], 1, [10, 10, 90, 90])).toBeUndefined();
      expect(findDominantMap([queensdale, ebg], 2, [10, 10, 90, 90])?.id).toBe(38);
    });

    it("picks the map covering the most of the viewport near a border", () => {
      const left = mapInfo({id: 1, continent_rect: [[0, 0], [1000, 1000]]});
      const right = mapInfo({id: 2, continent_rect: [[1000, 0], [2000, 1000]]});
      // View straddles the shared border but mostly lies in `right`.
      expect(findDominantMap([left, right], 1, [900, 0, 1900, 1000])?.id).toBe(2);
      // ...and the mirror case lands in `left`.
      expect(findDominantMap([left, right], 1, [100, 0, 1100, 1000])?.id).toBe(1);
    });

    it("prefers the smaller map when both fully cover the view (nested)", () => {
      const region = mapInfo({id: 1, continent_rect: [[0, 0], [1000, 1000]]});
      const inner = mapInfo({id: 2, continent_rect: [[400, 400], [600, 600]]});
      const view: [number, number, number, number] = [450, 450, 550, 550];
      expect(findDominantMap([region, inner], 1, view)?.id).toBe(2);
      expect(findDominantMap([inner, region], 1, view)?.id).toBe(2);
    });
  });

  describe("resolveFloor", () => {
    const queensdale = mapInfo({floors: [0, 1, 2, 3, 65]});

    it("keeps the selected floor while the map supports it", () => {
      expect(resolveFloor(queensdale, 2)).toBe(2);
    });

    it("reverts to floor 1 when the map does not support the selection", () => {
      const ebg = mapInfo({floors: [1, 3]});
      expect(resolveFloor(ebg, 2)).toBe(DEFAULT_FLOOR);
    });

    it("reverts to floor 1 when there is no map under the view", () => {
      expect(resolveFloor(undefined, 2)).toBe(DEFAULT_FLOOR);
    });

    it("stays on floor 1 without consulting the map", () => {
      expect(resolveFloor(undefined, DEFAULT_FLOOR)).toBe(DEFAULT_FLOOR);
    });
  });
});
