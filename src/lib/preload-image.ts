const requested = new Set<string>();

/** Warm the browser cache for an image URL. No-op if already requested or empty. */
export function preloadImage(url: string | undefined): void {
  if (!url || requested.has(url)) {
    return;
  }
  requested.add(url);
  new Image().src = url;
}
