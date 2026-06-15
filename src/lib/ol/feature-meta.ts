import {FeatureLike} from "ol/Feature";
import {Style} from "ol/style";
import {StyleLike} from "ol/style/Style";
import {masteryFriendlyName} from "./marker-styles";

/**
 * Cross-map feature metadata (tooltip, wiki URL, chat link) resolved per
 * source-layer, plus the `forSourceLayer` style wrapper. Lives here rather than
 * in either map module because both Tyria and Mists share live/user/editor/event
 * features.
 */

/** Applies `style` only to features whose `layer` tag matches `sourceLayer`. */
export const forSourceLayer = (
  sourceLayer: string,
  style: (feature: FeatureLike, resolution: number) => Style | Style[] | undefined,
): StyleLike =>
  (feature, resolution) => feature.get("layer") === sourceLayer ? style(feature, resolution) : undefined;

/** Hover tooltip text per source-layer, mirroring the old Leaflet bindTooltip calls. */
export function tooltipFor(feature: FeatureLike): string | undefined {
  switch (feature.get("layer")) {
    case "waypoint":
    case "poi":
    case "unlock":
    case "heart":
    case "label_sector":
    case "event":
    case "live":
    case "user":
    case "editor":
      return feature.get("tooltip") || feature.get("chat_link") || undefined;
    case "vista":
      return "Vista";
    case "heropoint":
      return "Skillpoint";
    case "mastery":
      return `${masteryFriendlyName(feature.get("region"))} Mastery`;
    case "adventure":
      return feature.get("name") || undefined;
    case "city":
      return feature.get("name") || undefined;
    default:
      return undefined;
  }
}

/** Double-click target per source-layer (wiki search or adventure url). */
export function wikiUrlFor(feature: FeatureLike): string | undefined {
  const search = (term: string) => `https://wiki.guildwars2.com/wiki/?search=${term}&ns0=1`;
  switch (feature.get("layer")) {
    case "waypoint":
    case "poi":
    case "unlock":
      return feature.get("tooltip") ? search(feature.get("tooltip")) : search(encodeURIComponent(feature.get("chat_link") ?? ""));
    case "heart": {
      const tooltip: string = feature.get("tooltip") ?? "";
      // Heart tooltips end with a period; the old map trimmed it for the search.
      return tooltip ? search(tooltip.substring(0, tooltip.length - 1)) : undefined;
    }
    case "adventure":
      return feature.get("url") || undefined;
    case "city":
      return feature.get("name") ? search(feature.get("name")) : undefined;
    default:
      return undefined;
  }
}

/** Click-to-copy chat link, where the source data has one. */
export function chatLinkFor(feature: FeatureLike): string | undefined {
  switch (feature.get("layer")) {
    case "waypoint":
    case "poi":
    case "unlock":
    case "heart":
    case "vista":
    case "label_sector":
    case "event": // closest waypoint to the boss
      return feature.get("chat_link") || undefined;
    default:
      return undefined;
  }
}
