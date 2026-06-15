import {inject, Injectable} from "@angular/core";
import {DOCUMENT} from "@angular/common";
import {Meta, Title} from "@angular/platform-browser";
import {ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy} from "@angular/router";

/** Canonical origin for the site. Search Console reports the gw2.io property, but the
 *  app is served from (and canonicalises to) maps.gw2.io. */
export const CANONICAL_ORIGIN = "https://maps.gw2.io";

/** Defaults used on routes that don't declare their own metadata (and as the static
 *  values baked into index.html). The brand suffix is appended to per-route titles. */
const BRAND_SUFFIX = "GW2 Map";
const DEFAULT_TITLE = "GW2 Interactive Map – Tyria, WvW & Live Map | gw2.io";
const DEFAULT_DESCRIPTION =
  "Interactive Guild Wars 2 map for Tyria and WvW – waypoints, vistas, points of " +
  "interest, hearts, events, live WvW match overviews, drawing tools and shareable location links.";

/** Shape of the `data` we read off routes in map-shell.routes.ts. */
export interface SeoRouteData {
  description?: string;
  canonicalPath?: string;
}

/**
 * Drives per-route document title and SEO meta. Replaces Angular's default
 * TitleStrategy (wired in app.config.ts) so it runs once on every successful
 * navigation. Beyond the title it keeps the description / og:* / twitter:* tags
 * and the canonical link in sync with the active route.
 *
 * The map writes "#lat,lng,zoom" fragments on every pan and supports marker
 * deep-links (/tyria/:chatLink), so the canonical is built from the route's
 * declared `canonicalPath` (falling back to the path with query + fragment
 * stripped) — that consolidates ranking signals onto /tyria and /wvw instead of
 * forking into a near-infinite set of duplicates.
 */
@Injectable()
export class Gw2TitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const routeTitle = this.buildTitle(snapshot);
    const data = this.collectData(snapshot.root);

    this.title.setTitle(routeTitle ? `${routeTitle} | ${BRAND_SUFFIX}` : DEFAULT_TITLE);

    const socialTitle = routeTitle ?? DEFAULT_TITLE;
    const description = data.description ?? DEFAULT_DESCRIPTION;
    this.meta.updateTag({name: "description", content: description});
    this.meta.updateTag({property: "og:title", content: socialTitle});
    this.meta.updateTag({name: "twitter:title", content: socialTitle});
    this.meta.updateTag({property: "og:description", content: description});
    this.meta.updateTag({name: "twitter:description", content: description});

    const path = data.canonicalPath ?? this.cleanPath(snapshot.url);
    this.updateCanonical(`${CANONICAL_ORIGIN}${path}`);
  }

  /** Walk root -> leaf, taking the deepest declared description/canonicalPath. */
  private collectData(root: ActivatedRouteSnapshot): SeoRouteData {
    const data: SeoRouteData = {};
    let route: ActivatedRouteSnapshot | null = root;
    while (route) {
      if (route.data["description"] != null) data.description = route.data["description"] as string;
      if (route.data["canonicalPath"] != null) data.canonicalPath = route.data["canonicalPath"] as string;
      route = route.firstChild;
    }
    return data;
  }

  private cleanPath(url: string): string {
    return url.split("#")[0].split("?")[0] || "/";
  }

  private updateCanonical(href: string): void {
    let link = this.document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement("link");
      link.setAttribute("rel", "canonical");
      this.document.head.appendChild(link);
    }
    link.setAttribute("href", href);
  }
}
