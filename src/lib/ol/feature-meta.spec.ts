import {FeatureLike} from "ol/Feature";
import {chatLinkFor, tooltipFor, wikiUrlFor} from "./feature-meta";

/** Minimal stand-in for an OL feature: only `get(key)` is exercised here. */
const feature = (props: Record<string, unknown>): FeatureLike =>
  ({get: (key: string) => props[key]} as unknown as FeatureLike);

describe("chatLinkFor", () => {
  it("returns the chat link for copyable layers", () => {
    expect(chatLinkFor(feature({layer: "waypoint", chat_link: "[&BdAEAAA=]"}))).toBe("[&BdAEAAA=]");
    expect(chatLinkFor(feature({layer: "event", chat_link: "[&Bw==]"}))).toBe("[&Bw==]");
  });

  it("returns undefined for non-copyable layers or missing links", () => {
    expect(chatLinkFor(feature({layer: "city", chat_link: "[&B]"}))).toBeUndefined();
    expect(chatLinkFor(feature({layer: "waypoint"}))).toBeUndefined();
  });
});

describe("tooltipFor", () => {
  it("prefers the tooltip, falling back to the chat link", () => {
    expect(tooltipFor(feature({layer: "poi", tooltip: "Some PoI"}))).toBe("Some PoI");
    expect(tooltipFor(feature({layer: "poi", chat_link: "[&B]"}))).toBe("[&B]");
  });

  it("uses fixed labels for vista and hero points", () => {
    expect(tooltipFor(feature({layer: "vista"}))).toBe("Vista");
    expect(tooltipFor(feature({layer: "heropoint"}))).toBe("Skillpoint");
  });

  it("returns undefined for layers with no tooltip", () => {
    expect(tooltipFor(feature({layer: "sector_bounds"}))).toBeUndefined();
  });
});

describe("wikiUrlFor", () => {
  it("builds a wiki search from a waypoint tooltip", () => {
    expect(wikiUrlFor(feature({layer: "waypoint", tooltip: "Waypoint"})))
      .toBe("https://wiki.guildwars2.com/wiki/?search=Waypoint&ns0=1");
  });

  it("uses the adventure url directly", () => {
    expect(wikiUrlFor(feature({layer: "adventure", url: "https://example.com/a"}))).toBe("https://example.com/a");
  });

  it("returns undefined for layers with no wiki target", () => {
    expect(wikiUrlFor(feature({layer: "event"}))).toBeUndefined();
  });
});
