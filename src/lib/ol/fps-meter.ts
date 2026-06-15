import OlMap from "ol/Map";
import {EventsKey} from "ol/events";
import {unByKey} from "ol/Observable";

export interface FpsMeterOptions {
  /** Invoked on a left-click of the widget — wired to the pan benchmark. */
  onClick?: () => void;
}

/** Deltas above this are tab switches / debugger pauses, not rendered frames. */
const MAX_VALID_DELTA_MS = 250;
/** Sparkline vertical scale: a full-height bar is a 50ms frame. */
const SPARK_MAX_MS = 50;
/** Frames slower than this draw red (two missed 60Hz vsyncs). */
const SPARK_SLOW_MS = 33;
const SPARK_WIDTH_CSS = 90;
const SPARK_HEIGHT_CSS = 28;
/** Text refresh cadence; the sparkline still updates every frame. */
const TEXT_INTERVAL_MS = 250;

/**
 * Dev/diagnostic FPS widget for the OL maps. Two complementary signals:
 *
 *  - rAF frame deltas — main-thread jank, the real "smoothness during panning"
 *    measure; rAF fires per compositor frame whether or not OL re-renders.
 *  - postrender count — how often OL actually re-rendered, distinguishing
 *    "map animating" from idle compositor frames.
 *
 * Must be constructed outside the Angular zone (zone.js patches rAF, and a
 * per-frame change-detection pass would corrupt the very numbers we measure).
 * The widget attaches to the OL viewport — NOT getOverlayContainer(), which OL
 * CSS-transforms during panning and would drag the widget around with the map.
 */
export class FpsMeter {
  private readonly container: HTMLDivElement;
  private readonly textEl: HTMLDivElement;
  private readonly summaryEl: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly keys: EventsKey[] = [];
  private readonly onVisibilityChange = () => this.lastFrameTime = undefined;

  private deltas: number[] = [];
  private renderCount = 0;
  private lastFrameTime?: number;
  private lastTextUpdate = 0;
  private lastText = "";
  private dpr = 0;
  private rafHandle = 0;
  private summaryTimer?: ReturnType<typeof setTimeout>;
  private disposed = false;

  constructor(map: OlMap, private readonly options?: FpsMeterOptions) {
    this.container = document.createElement("div");
    this.container.style.cssText =
      "position:absolute;bottom:8px;left:8px;z-index:1000;padding:4px 6px;border-radius:3px;" +
      "background:rgba(0,0,0,.65);color:#FFCC66;font:11px/1.4 Consolas,monospace;" +
      "cursor:pointer;user-select:none";
    this.container.title = "Run pan benchmark";

    this.textEl = document.createElement("div");
    this.textEl.style.whiteSpace = "nowrap";
    this.textEl.textContent = "-- fps";

    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = `display:block;margin-top:3px;width:${SPARK_WIDTH_CSS}px;height:${SPARK_HEIGHT_CSS}px`;
    this.ctx = this.canvas.getContext("2d");

    this.summaryEl = document.createElement("div");
    this.summaryEl.style.cssText = "display:none;white-space:nowrap;color:#9d9";

    this.container.append(this.textEl, this.canvas, this.summaryEl);

    // The viewport owns map gestures (drag-pan, dblclick-zoom, wheel-zoom and
    // the base map's right-click drawing) — none of them may fire through the
    // widget.
    for (const type of ["pointerdown", "pointerup", "dblclick", "contextmenu", "wheel"] as const) {
      this.container.addEventListener(type, e => e.stopPropagation());
    }
    this.container.addEventListener("click", e => {
      e.stopPropagation();
      this.options?.onClick?.();
    });

    map.getViewport().appendChild(this.container);

    this.keys.push(map.on("postrender", () => this.renderCount++) as EventsKey);
    // rAF stops while the tab is hidden; without this reset the first frame
    // back would register as one enormous "worst" delta.
    document.addEventListener("visibilitychange", this.onVisibilityChange);

    this.rafHandle = requestAnimationFrame(this.onFrame);
  }

  private readonly onFrame = (now: number) => {
    if (this.disposed) {
      return;
    }
    if (this.lastFrameTime !== undefined) {
      const delta = now - this.lastFrameTime;
      if (delta <= MAX_VALID_DELTA_MS) {
        this.deltas.push(delta);
        this.drawBar(delta);
      }
    }
    this.lastFrameTime = now;
    if (now - this.lastTextUpdate >= TEXT_INTERVAL_MS) {
      this.updateText(now);
    }
    this.rafHandle = requestAnimationFrame(this.onFrame);
  };

  /** Stats.js-style shift-blit: one drawImage + two fillRects, no DOM layout. */
  private drawBar(delta: number): void {
    if (!this.ctx) {
      return;
    }
    const {width, height} = this.canvas;
    const col = Math.max(1, Math.round(this.dpr));
    this.ctx.drawImage(this.canvas, col, 0, width - col, height, 0, 0, width - col, height);
    this.ctx.fillStyle = "rgba(0,0,0,.85)";
    this.ctx.fillRect(width - col, 0, col, height);
    const barHeight = Math.max(1, Math.round(Math.min(delta / SPARK_MAX_MS, 1) * height));
    this.ctx.fillStyle = delta > SPARK_SLOW_MS ? "#FF5544" : "#FFCC66";
    this.ctx.fillRect(width - col, height - barHeight, col, barHeight);
  }

  private updateText(now: number): void {
    const elapsed = now - this.lastTextUpdate;
    this.lastTextUpdate = now;
    this.checkPixelRatio();

    // Rolling ~1s window: walk back until a second of frame time is covered,
    // then drop everything older so the buffer stays bounded.
    let count = 0;
    let sum = 0;
    let worst = 0;
    for (let i = this.deltas.length - 1; i >= 0 && sum < 1000; i--) {
      const delta = this.deltas[i];
      count++;
      sum += delta;
      worst = Math.max(worst, delta);
    }
    this.deltas.splice(0, this.deltas.length - count);

    const rendersPerSec = Math.round(this.renderCount * 1000 / elapsed);
    this.renderCount = 0;

    const text = count === 0 ? "-- fps" :
      `${Math.round(count * 1000 / sum)} fps | avg ${(sum / count).toFixed(1)}ms worst ${worst.toFixed(1)}ms | ${rendersPerSec} rnd/s`;
    if (text !== this.lastText) {
      this.lastText = text;
      this.textEl.textContent = text;
    }
  }

  /** Lazily resync to devicePixelRatio (browser zoom, cross-monitor drags). */
  private checkPixelRatio(): void {
    const dpr = window.devicePixelRatio || 1;
    if (dpr === this.dpr) {
      return;
    }
    this.dpr = dpr;
    this.canvas.width = Math.round(SPARK_WIDTH_CSS * dpr);
    this.canvas.height = Math.round(SPARK_HEIGHT_CSS * dpr);
    if (this.ctx) {
      this.ctx.fillStyle = "rgba(0,0,0,.85)";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /** Show/hide the widget without tearing down its measurement loop. */
  setVisible(visible: boolean): void {
    this.container.style.display = visible ? "" : "none";
  }

  /** Flash a result line (e.g. a benchmark summary) under the sparkline. */
  showSummary(text: string): void {
    this.summaryEl.textContent = text;
    this.summaryEl.style.display = "";
    clearTimeout(this.summaryTimer);
    this.summaryTimer = setTimeout(() => this.summaryEl.style.display = "none", 8000);
  }

  destroy(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafHandle);
    clearTimeout(this.summaryTimer);
    unByKey(this.keys);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.container.remove();
  }
}
