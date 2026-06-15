import OlMap from "ol/Map";
import BaseLayer from "ol/layer/Base";
import {EventsKey} from "ol/events";
import {unByKey} from "ol/Observable";

export interface CloudOverlayConfig {
  /**
   * The two seamless cloud textures (white wisps, shape in the alpha channel).
   * They tile and scroll at different rates; their overlap morphs over time.
   * Pass absolute paths ("/assets/..."): the element lives in the DOM, so a
   * relative url would resolve against the current route (/wvw, /:chatLink).
   */
  textures: [string, string];
  /** Full strength at/below this zoom. */
  fadeStartZoom: number;
  /** Faded to nothing (and display:none) at/above this zoom. */
  fadeEndZoom: number;
  /** Peak opacity of the whole layer at fadeStartZoom. */
  maxOpacity: number;
  /** Panel-stub layer whose visibility toggle the clouds follow. */
  layer?: BaseLayer;
}

/**
 * Resolution the overlay is laid out at; the per-frame transform scales it to
 * the live view (scale = BASE_RESOLUTION / resolution), like LabelOverlays.
 * This is the cloud-size knob: raising it stretches the textures further across
 * the map (and lays the root out coarser, shrinking the backing bitmap). At 512
 * each 256px tile is stretched ~8x past native — soft, billowy continent-wide
 * clouds; lower it for smaller, crisper clouds.
 */
const BASE_RESOLUTION = 512;

/**
 * Animated, world-anchored cloud sheet — the "above the clouds, looking down"
 * effect of the in-game world map. A single element spans the whole map and is
 * repositioned/scaled per rendered frame with one CSS transform (compositor
 * work, the LabelOverlays trick), so it pans and zooms glued to the terrain.
 *
 * The drift and cross-blend are pure CSS keyframes on the two child layers
 * (transform + tiling background) — they run entirely on the compositor, never
 * touching the main thread or re-rasterising. The only per-frame JS is the one
 * transform write, and that only while the layer is visible.
 *
 * Clouds belong to the most zoomed-out view, so the root fades out over a
 * couple of zoom levels and goes display:none past fadeEndZoom — at the zooms
 * people actually navigate at, the layer is inert and costs nothing.
 *
 * Lives in OL's overlay container (sibling of ol-layers) at a negative z-index
 * so it paints above the map tiles but behind the heading labels and tooltips.
 */
export class CloudOverlay {
  private readonly root: HTMLDivElement;
  private readonly keys: EventsKey[] = [];
  private visible = false;

  constructor(
    private readonly map: OlMap,
    private readonly config: CloudOverlayConfig,
  ) {
    this.root = document.createElement("div");
    this.root.className = "gw2-cloud-root";
    this.root.style.display = "none"; // until the first updateVisibility positions it

    const [worldW, worldH] = this.worldSize();
    this.root.style.width = `${worldW / BASE_RESOLUTION}px`;
    this.root.style.height = `${worldH / BASE_RESOLUTION}px`;

    for (const [i, texture] of config.textures.entries()) {
      const layer = document.createElement("div");
      layer.className = `gw2-cloud-layer gw2-cloud-layer--${i === 0 ? "a" : "b"}`;
      layer.style.backgroundImage = `url("${texture}")`;
      // Random drift phase + texture offset so the pattern (the overlap of the
      // two layers) starts differently every load. Negative animation-delay
      // starts the looping drift partway through its cycle. One-off styles, no
      // per-frame cost.
      layer.style.animationDelay = `${(-Math.random() * 600).toFixed(2)}s`;
      layer.style.backgroundPosition = `${(Math.random() * 100).toFixed(1)}% ${(Math.random() * 100).toFixed(1)}%`;
      this.root.appendChild(layer);
    }

    // Append (not prepend): the heading labels prepend their svg/canvas, so the
    // negative z-index is what guarantees clouds paint behind them regardless of
    // construction order.
    map.getOverlayContainer().appendChild(this.root);

    this.keys.push(
      map.on("postrender", () => this.reproject()) as EventsKey,
      map.getView().on("change:resolution", () => this.updateVisibility()) as EventsKey,
    );
    if (config.layer) {
      this.keys.push(config.layer.on("change:visible", () => this.updateVisibility()) as EventsKey);
    }
    this.updateVisibility();
  }

  /** World extent in continent pixels, from the view's projection. */
  private worldSize(): [number, number] {
    const [minX, minY, maxX, maxY] = this.map.getView().getProjection().getExtent();
    return [maxX - minX, maxY - minY];
  }

  /** One transform write per frame keeps the sheet glued to the map. */
  private reproject(): void {
    if (!this.visible) {
      return;
    }
    const origin = this.map.getPixelFromCoordinate([0, 0]); // screen px of the world's top-left
    const resolution = this.map.getView().getResolution();
    if (!origin || !resolution) {
      return;
    }
    const scale = BASE_RESOLUTION / resolution;
    this.root.style.transform = `translate(${origin[0]}px, ${origin[1]}px) scale(${scale})`;
  }

  private updateVisibility(): void {
    const zoom = this.map.getView().getZoom() ?? 0;
    const panelOn = !this.config.layer || this.config.layer.getVisible();
    const opacity = panelOn ? this.fadeOpacity(zoom) : 0;
    this.visible = opacity > 0;
    // display:none past the fade also pauses the CSS animations — no compositor
    // work at the zooms the map is normally used at.
    this.root.style.display = this.visible ? "" : "none";
    this.root.style.opacity = String(opacity);
    this.reproject();
  }

  /** Linear ramp: maxOpacity at/below fadeStartZoom, 0 at/above fadeEndZoom. */
  private fadeOpacity(zoom: number): number {
    const {fadeStartZoom, fadeEndZoom, maxOpacity} = this.config;
    if (zoom <= fadeStartZoom) {
      return maxOpacity;
    }
    if (zoom >= fadeEndZoom) {
      return 0;
    }
    return maxOpacity * (fadeEndZoom - zoom) / (fadeEndZoom - fadeStartZoom);
  }

  destroy(): void {
    unByKey(this.keys);
    this.root.remove();
  }
}
