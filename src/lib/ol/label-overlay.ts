import OlMap from "ol/Map";
import BaseLayer from "ol/layer/Base";
import {Coordinate} from "ol/coordinate";
import {EventsKey} from "ol/events";
import {unByKey} from "ol/Observable";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface LabelEntry {
  /** OL coordinate ([x, -y] of GW2 continent px) — pass through gw2ToOl. */
  coord: Coordinate;
  heading: string;
  subheading?: string;
  kind: "region" | "map";
}

export interface LabelGroup {
  entries: LabelEntry[];
  /** Panel layer whose visibility toggle the labels follow. */
  layer: BaseLayer;
  minZoom: number;
  maxZoom: number;
  opacityLevels: {[z: number]: number};
  /** Continuous fade-out while zooming in: opaque at `start`, gone at `end`. */
  fadeOut?: {start: number; end: number};
}

/**
 * Font sizes in world (continent) pixels, identical to the production SVG
 * overlays (.region-heading 20rem, .map-heading 8rem, .map-subheading 7.6em):
 * the label keeps a constant footprint on the map at every zoom level.
 */
const WORLD_LABEL_STYLES = {
  region: {sizeWorldPx: 320, color: "#FFCC66"},
  map: {sizeWorldPx: 128, color: "#FFCC66"},
  map_sub: {sizeWorldPx: 121.6, color: "#DDD", offsetYWorldPx: 120},
};

/** Resolution the SVG is laid out at; transform scale = base/current. */
const BASE_RESOLUTION = 6; // zoom 4 on a maxZoom-7 map

/** Extra viewport fraction captured per side in the zoom snapshot, so a
 * one-notch zoom-out (2x extent) stays covered without re-drawing. */
const SNAPSHOT_MARGIN = 0.5;
/** Re-draw the snapshot when the live scale leaves [min, max]: below min the
 * margin is exhausted (blank edges would show), above max the stretched
 * bitmap gets noticeably blurry. */
const SNAPSHOT_MIN_SCALE = 0.55;
const SNAPSHOT_MAX_SCALE = 3;
/** Device-pixel budget for the snapshot bitmap; larger windows draw the
 * snapshot at reduced resolution rather than allocating more memory. */
const SNAPSHOT_MAX_PIXELS = 12_000_000;

function worldText(content: string, x: number, y: number, sizeWorldPx: number, color: string): SVGTextElement {
  const text = document.createElementNS(SVG_NS, "text") as SVGTextElement;
  text.setAttribute("x", `${x / BASE_RESOLUTION}`);
  text.setAttribute("y", `${y / BASE_RESOLUTION}`);
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "central");
  text.style.font = `italic ${sizeWorldPx / BASE_RESOLUTION}px 'PT Serif', serif`;
  text.style.fill = color;
  // Soft drop shadow modelled on the production Leaflet CSS (.region-heading /
  // .map-heading used 3px 2px 3px / -2px -2px 3px); px here are pre-transform SVG
  // units laid out at world/BASE_RESOLUTION, so dividing the production offsets by
  // the same BASE_RESOLUTION reproduces the original on-screen geometry and keeps
  // it scaling with the text. The primary (down-right) pass is drawn twice so the
  // opaque-black shadow composites onto itself and reads a touch darker than the
  // original, without enlarging the footprint.
  text.style.textShadow =
    "0.5px 0.333px 0.5px #000, 0.5px 0.333px 0.5px #000, -0.333px -0.333px 0.5px #010";
  text.textContent = content;
  return text;
}

/**
 * World-anchored heading labels as a single SVG spanning the map, the OL
 * counterpart of the old Leaflet SVGOverlay: text is laid out once in world
 * coordinates and the whole element is repositioned/scaled per rendered frame
 * with one CSS transform. Labels therefore keep a constant size relative to
 * the map (production behaviour) while moving perfectly in sync with it — no
 * per-frame text re-rendering, no resize jitter.
 *
 * Panning only changes the transform's translation, which the compositor
 * serves from the cached texture. A zoom animation changes the SCALE every
 * frame, and rescaling a large shadowed-text layer forces the compositor to
 * re-rasterise it per frame — the dominant zoom-jank cost when profiled. So
 * while the resolution is animating, the labels are swapped for a one-off
 * canvas snapshot (stretching a canvas texture is compositor-only work) and
 * the crisp SVG returns on moveend.
 *
 * Both elements live in OL's overlay container (sibling of ol-layers) so OL's
 * own animation transform never applies; we own the transforms entirely.
 */
export class LabelOverlays {
  private readonly svg: SVGSVGElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly groupEls = new Map<LabelGroup, SVGGElement>();
  private readonly keys: EventsKey[] = [];
  private lastResolution?: number;
  /** Set while a zoom is in flight: the canvas is showing, the SVG is hidden. */
  private snapshot?: {originPx: Coordinate; resolution: number; marginPx: [number, number]};

  constructor(
    private readonly map: OlMap,
    private readonly groups: LabelGroup[],
  ) {
    this.svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
    this.svg.style.cssText =
      "position:absolute;top:0;left:0;overflow:visible;pointer-events:none;transform-origin:0 0;will-change:transform";
    this.svg.style.display = "none"; // until the first postrender positions it

    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText =
      "position:absolute;top:0;left:0;pointer-events:none;transform-origin:0 0;will-change:transform;display:none";

    for (const group of groups) {
      const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
      for (const entry of group.entries) {
        const [x, y] = [entry.coord[0], -entry.coord[1]];
        const style = WORLD_LABEL_STYLES[entry.kind];
        g.appendChild(worldText(entry.heading, x, y, style.sizeWorldPx, style.color));
        if (entry.subheading) {
          const sub = WORLD_LABEL_STYLES.map_sub;
          g.appendChild(worldText(entry.subheading, x, y + sub.offsetYWorldPx, sub.sizeWorldPx, sub.color));
        }
      }
      this.svg.appendChild(g);
      this.groupEls.set(group, g);
      this.keys.push(group.layer.on("change:visible", () => this.updateVisibility()) as EventsKey);
    }
    // Decorative headings must paint behind every OL-managed overlay
    // (tooltips, popups), so prepend instead of append — overlay wrappers
    // added by addOverlay() land later in the same container and win the
    // paint order.
    map.getOverlayContainer().prepend(this.canvas, this.svg);

    this.keys.push(
      map.on("postrender", () => this.reproject()) as EventsKey,
      map.on("moveend", () => this.settle()) as EventsKey,
      map.getView().on("change:resolution", () => this.updateVisibility()) as EventsKey,
    );
    this.updateVisibility();
  }

  /** One transform write per frame keeps the active element glued to the map. */
  private reproject(): void {
    const origin = this.map.getPixelFromCoordinate([0, 0]);
    const resolution = this.map.getView().getResolution();
    if (!origin || !resolution) {
      return;
    }
    if (this.lastResolution !== undefined && resolution !== this.lastResolution && !this.snapshot) {
      this.takeSnapshot(origin, resolution);
    }
    this.lastResolution = resolution;

    if (this.snapshot) {
      let scale = this.snapshot.resolution / resolution;
      if (scale < SNAPSHOT_MIN_SCALE || scale > SNAPSHOT_MAX_SCALE) {
        this.takeSnapshot(origin, resolution);
        scale = this.snapshot.resolution / resolution;
      }
      const [marginW, marginH] = this.snapshot.marginPx;
      const tx = origin[0] - scale * (this.snapshot.originPx[0] + marginW);
      const ty = origin[1] - scale * (this.snapshot.originPx[1] + marginH);
      this.canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
      return;
    }

    const scale = BASE_RESOLUTION / resolution;
    this.svg.style.display = "";
    this.svg.style.transform = `translate(${origin[0]}px, ${origin[1]}px) scale(${scale})`;
  }

  /** The gesture finished — back to the crisp SVG. */
  private settle(): void {
    if (!this.snapshot) {
      return;
    }
    this.snapshot = undefined;
    this.canvas.style.display = "none";
    // moveend can arrive before the final postrender, so the stale comparison
    // baseline would read as "still scaling" and immediately re-snapshot.
    this.lastResolution = undefined;
    this.reproject();
  }

  /**
   * Draws the currently visible labels, at their current on-screen position
   * and size, into the canvas covering the viewport plus margin. Runs once
   * per zoom gesture (plus re-draws when the scale leaves the snapshot's
   * usable range), not per frame.
   */
  private takeSnapshot(originPx: Coordinate, resolution: number): void {
    const size = this.map.getSize();
    const ctx = this.canvas.getContext("2d");
    if (!size || !ctx) {
      return;
    }
    const marginW = Math.round(size[0] * SNAPSHOT_MARGIN);
    const marginH = Math.round(size[1] * SNAPSHOT_MARGIN);
    const cssW = size[0] + 2 * marginW;
    const cssH = size[1] + 2 * marginH;
    const dpr = window.devicePixelRatio || 1;
    const deviceScale = dpr * Math.min(1, Math.sqrt(SNAPSHOT_MAX_PIXELS / (cssW * cssH * dpr * dpr)));
    const pxW = Math.round(cssW * deviceScale);
    const pxH = Math.round(cssH * deviceScale);
    if (this.canvas.width !== pxW || this.canvas.height !== pxH) {
      this.canvas.width = pxW; // also resets all canvas context state
      this.canvas.height = pxH;
      this.canvas.style.width = `${cssW}px`;
      this.canvas.style.height = `${cssH}px`;
    } else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, pxW, pxH);
    }
    ctx.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // The SVG shadow's px are SVG units (world/BASE_RESOLUTION); canvas shadow
    // params are device px, unaffected by the context transform.
    const shadowUnit = (BASE_RESOLUTION / resolution) * deviceScale;
    ctx.shadowColor = "#000";
    ctx.shadowOffsetX = 0.5 * shadowUnit;
    ctx.shadowOffsetY = 0.333 * shadowUnit;
    ctx.shadowBlur = 0.5 * shadowUnit;

    const zoom = this.map.getView().getZoom() ?? 0;
    for (const group of this.groups) {
      const opacity = this.groupOpacity(group, zoom);
      if (!group.layer.getVisible() || zoom < group.minZoom - 0.5 || zoom > group.maxZoom + 0.5 || opacity === 0) {
        continue;
      }
      ctx.globalAlpha = opacity;
      for (const entry of group.entries) {
        const px = this.map.getPixelFromCoordinate(entry.coord);
        if (!px) {
          continue;
        }
        const style = WORLD_LABEL_STYLES[entry.kind];
        const sizePx = style.sizeWorldPx / resolution;
        const x = px[0] + marginW;
        const y = px[1] + marginH;
        // Generous bounds estimate; skipping far-offscreen labels keeps the
        // draw cost proportional to what's visible.
        const pad = entry.heading.length * sizePx;
        if (x + pad < 0 || x - pad > cssW || y + 3 * sizePx < 0 || y - 3 * sizePx > cssH) {
          continue;
        }
        ctx.font = `italic ${sizePx}px 'PT Serif', serif`;
        ctx.fillStyle = style.color;
        // Drawn twice so the opaque-black shadow composites onto itself, matching
        // the stacked primary text-shadow on the SVG path. The fill is opaque, so
        // the second pass only deepens the shadow (idempotent for the glyph body
        // at full group opacity — the prominent case).
        ctx.fillText(entry.heading, x, y);
        ctx.fillText(entry.heading, x, y);
        if (entry.subheading) {
          const sub = WORLD_LABEL_STYLES.map_sub;
          ctx.font = `italic ${sub.sizeWorldPx / resolution}px 'PT Serif', serif`;
          ctx.fillStyle = sub.color;
          ctx.fillText(entry.subheading, x, y + sub.offsetYWorldPx / resolution);
          ctx.fillText(entry.subheading, x, y + sub.offsetYWorldPx / resolution);
        }
      }
    }
    ctx.globalAlpha = 1;

    this.snapshot = {originPx: [originPx[0], originPx[1]], resolution, marginPx: [marginW, marginH]};
    this.svg.style.display = "none";
    this.canvas.style.display = "";
  }

  private updateVisibility(): void {
    const zoom = this.map.getView().getZoom() ?? 0;
    for (const group of this.groups) {
      const g = this.groupEls.get(group)!;
      const opacity = this.groupOpacity(group, zoom);
      const inRange = group.layer.getVisible()
        && zoom >= group.minZoom - 0.5
        && zoom <= group.maxZoom + 0.5
        && opacity > 0;
      g.style.display = inRange ? "" : "none";
      g.style.opacity = String(opacity);
    }
  }

  /** Stepwise per-level opacity combined with the group's continuous fade-out. */
  private groupOpacity(group: LabelGroup, zoom: number): number {
    const level = group.opacityLevels[Math.round(zoom)] ?? 1;
    if (!group.fadeOut) {
      return level;
    }
    const {start, end} = group.fadeOut;
    return level * Math.max(0, Math.min(1, (end - zoom) / (end - start)));
  }

  destroy(): void {
    unByKey(this.keys);
    this.svg.remove();
    this.canvas.remove();
  }
}
