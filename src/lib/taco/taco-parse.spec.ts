import {parseTacoXml, parseTrl} from "./taco-parse";

describe("parseTacoXml", () => {
  const xml = `<?xml version="1.0"?>
    <OverlayData>
      <MarkerCategory name="parent" DisplayName="Parent" iconFile="parent.png">
        <MarkerCategory name="child" DisplayName="Child Cat" iconFile="child.png"/>
      </MarkerCategory>
      <POIs>
        <POI MapID="15" xpos="100.5" ypos="20" zpos="-200.25" type="parent.child" iconFile="poi.png"/>
        <POI mapid="50" XPOS="1" ypos="0" ZPOS="2" type="parent"/>
        <POI MapID="15" xpos="bad" zpos="3"/>
        <Trail type="parent.child" trailData="trails/route.trl" color="ff0000"/>
      </POIs>
    </OverlayData>`;

  it("parses POIs (case-insensitively) and skips ones missing coords", () => {
    const {pois} = parseTacoXml(xml);
    expect(pois.length).toBe(2); // the xpos="bad" POI is dropped
    expect(pois[0]).toEqual(jasmine.objectContaining({
      mapId: 15, x: 100.5, y: 20, z: -200.25, type: "parent.child", iconFile: "poi.png",
    }));
    expect(pois[1]).toEqual(jasmine.objectContaining({mapId: 50, x: 1, z: 2}));
  });

  it("flattens the category tree into dotted lower-case keys", () => {
    const {categories} = parseTacoXml(xml);
    expect(categories.get("parent")?.displayName).toBe("Parent");
    expect(categories.get("parent.child")?.displayName).toBe("Child Cat");
    expect(categories.get("parent.child")?.iconFile).toBe("child.png");
  });

  it("parses a Trail's trailData reference with no points yet", () => {
    const {trails} = parseTacoXml(xml);
    expect(trails.length).toBe(1);
    expect(trails[0].trailData).toBe("trails/route.trl");
    expect(trails[0].type).toBe("parent.child");
    expect(trails[0].points.length).toBe(0);
  });

  it("throws on malformed XML", () => {
    expect(() => parseTacoXml("<OverlayData><POI ")).toThrow();
  });

  it("repairs unescaped ampersands (common in TacO DisplayNames)", () => {
    const dirty = `<OverlayData>
      <MarkerCategory name="c" DisplayName="Mussels & Jungle Plants"/>
      <POIs><POI MapID="15" xpos="1" ypos="0" zpos="2" type="c"/></POIs>
    </OverlayData>`;
    const {pois, categories} = parseTacoXml(dirty);
    expect(pois.length).toBe(1);
    expect(categories.get("c")?.displayName).toBe("Mussels & Jungle Plants");
  });
});

describe("parseTrl", () => {
  function makeTrl(mapId: number, pts: number[][]): ArrayBuffer {
    const buf = new ArrayBuffer(8 + pts.length * 12);
    const v = new DataView(buf);
    v.setUint32(0, 2, true);
    v.setInt32(4, mapId, true);
    pts.forEach((p, i) => {
      v.setFloat32(8 + i * 12, p[0], true);
      v.setFloat32(8 + i * 12 + 4, p[1], true);
      v.setFloat32(8 + i * 12 + 8, p[2], true);
    });
    return buf;
  }

  it("reads mapId and vertex triples (including a (0,0,0) break)", () => {
    const trl = parseTrl(makeTrl(38, [[1, 2, 3], [0, 0, 0], [4, 5, 6]]));
    expect(trl.mapId).toBe(38);
    expect(trl.points.length).toBe(3);
    expect(trl.points[0].x).toBeCloseTo(1);
    expect(trl.points[0].z).toBeCloseTo(3);
    expect(trl.points[1]).toEqual(jasmine.objectContaining({x: 0, y: 0, z: 0}));
    expect(trl.points[2].z).toBeCloseTo(6);
  });

  it("throws on a malformed length", () => {
    expect(() => parseTrl(new ArrayBuffer(10))).toThrow();
  });
});
