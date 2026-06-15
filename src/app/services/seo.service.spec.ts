import {TestBed} from "@angular/core/testing";
import {Meta, Title} from "@angular/platform-browser";
import {RouterStateSnapshot} from "@angular/router";
import {CANONICAL_ORIGIN, Gw2TitleStrategy} from "./seo.service";

// A minimal RouterStateSnapshot: just the root -> leaf chain the strategy walks via
// firstChild, plus the url it reads for the canonical fallback. The *resolved* route
// title lives under an internal router symbol during real navigation, so we stub
// buildTitle rather than depend on that private detail.
function snapshotWith(opts: {url: string; data?: Record<string, unknown>}): RouterStateSnapshot {
  const leaf = {data: opts.data ?? {}, firstChild: null};
  const root = {data: {}, firstChild: leaf};
  return {url: opts.url, root} as unknown as RouterStateSnapshot;
}

function canonicalHref(): string | null {
  return document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null;
}

describe("Gw2TitleStrategy", () => {
  const TYRIA_TITLE = "Tyria Interactive Map – Waypoints, Vistas & POIs";
  let strategy: Gw2TitleStrategy;
  let title: Title;
  let meta: Meta;

  beforeEach(() => {
    TestBed.configureTestingModule({providers: [Gw2TitleStrategy, Title, Meta]});
    strategy = TestBed.inject(Gw2TitleStrategy);
    title = TestBed.inject(Title);
    meta = TestBed.inject(Meta);
  });

  afterEach(() => {
    document.querySelector('link[rel="canonical"]')?.remove();
  });

  it("appends the brand suffix to the route title and mirrors the description into og/twitter tags", () => {
    spyOn(strategy, "buildTitle").and.returnValue(TYRIA_TITLE);

    strategy.updateTitle(snapshotWith({
      url: "/tyria/[&BO8AAAA=]#-494,432,4",
      data: {description: "Tyria desc", canonicalPath: "/tyria"},
    }));

    expect(title.getTitle()).toBe(`${TYRIA_TITLE} | GW2 Map`);
    expect(meta.getTag('name="description"')?.content).toBe("Tyria desc");
    expect(meta.getTag('property="og:title"')?.content).toBe(TYRIA_TITLE);
    expect(meta.getTag('property="og:description"')?.content).toBe("Tyria desc");
    expect(meta.getTag('name="twitter:title"')?.content).toBe(TYRIA_TITLE);
    expect(meta.getTag('name="twitter:description"')?.content).toBe("Tyria desc");
  });

  it("canonicalises to the declared path, dropping the marker deep-link and #pan fragment", () => {
    spyOn(strategy, "buildTitle").and.returnValue(TYRIA_TITLE);

    strategy.updateTitle(snapshotWith({
      url: "/tyria/[&BO8AAAA=]#-494,432,4",
      data: {description: "Tyria desc", canonicalPath: "/tyria"},
    }));

    expect(canonicalHref()).toBe(`${CANONICAL_ORIGIN}/tyria`);
  });

  it("falls back to the cleaned url path (no query or fragment) when no canonicalPath is declared", () => {
    spyOn(strategy, "buildTitle").and.returnValue("Some Page");

    strategy.updateTitle(snapshotWith({url: "/wvw/1001?x=1#1,2,3"}));

    expect(canonicalHref()).toBe(`${CANONICAL_ORIGIN}/wvw/1001`);
  });

  it("uses the default title and description for a route that declares no metadata", () => {
    spyOn(strategy, "buildTitle").and.returnValue(undefined);

    strategy.updateTitle(snapshotWith({url: "/"}));

    expect(title.getTitle()).toBe("GW2 Interactive Map – Tyria, WvW & Live Map | gw2.io");
    expect(meta.getTag('name="description"')?.content).toContain("Interactive Guild Wars 2 map");
    expect(canonicalHref()).toBe(`${CANONICAL_ORIGIN}/`);
  });
});
