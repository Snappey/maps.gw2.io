import OlMap from "ol/Map";
import View, {AnimationOptions} from "ol/View";
import {Coordinate} from "ol/coordinate";
import {EventsKey} from "ol/events";
import {unByKey} from "ol/Observable";

export interface PanBenchmarkOptions {
  /** Duration of each measured leg; default 1500ms. */
  legDurationMs?: number;
  /** Fast untimed lap first so tiles are cached and runs measure rendering, not network. Default true. */
  warmup?: boolean;
}

export interface BenchmarkResult {
  totalFrames: number;
  durationMs: number;
  avgFps: number;
  avgFrameMs: number;
  p95FrameMs: number;
  p99FrameMs: number;
  worstFrameMs: number;
  /** Frames slower than 1.5x the estimated display refresh interval. */
  droppedFrames: number;
  refreshIntervalMs: number;
  /** OL postrender count during the measured run. */
  renders: number;
  /** True if the run finished uninterrupted (results comparable across runs). */
  completed: boolean;
}

/** Deltas above this are tab switches, not rendered frames. */
export const MAX_VALID_DELTA_MS = 250;
/** Route corners as fractions of the map extent. The 30% inset keeps the
 * extent-constrained view from clamping the path at the edges. */
const ROUTE_FRACTIONS: [number, number][] = [[.3, .3], [.7, .3], [.7, .7], [.3, .7], [.5, .5]];
const COMMON_REFRESH_RATES_HZ = [60, 75, 90, 120, 144, 165, 240];

let running = false;

/**
 * Deterministic pan benchmark: animates the view around a square route derived
 * from the map extent (so the same code measures Tyria and the Mists) while
 * collecting rAF frame deltas, then restores the view and reports stats.
 *
 * Determinism choices: linear easing (constant pan velocity — the default
 * inAndOut easing spends half its time nearly stationary), fixed leg duration,
 * extent-derived zoom/waypoints, warm-up lap, and a SINGLE chained animate()
 * call. The single chain matters: it fires one moveend at the end, so the
 * fragment-write router.navigate in BaseOlMap stays out of the measured window.
 *
 * Call from outside the Angular zone.
 */
export function runPanBenchmark(map: OlMap, options?: PanBenchmarkOptions): Promise<BenchmarkResult> {
  if (running) {
    return Promise.reject(new Error("benchmark already running"));
  }
  running = true;
  return panBenchmark(map, options).finally(() => running = false);
}

async function panBenchmark(map: OlMap, options?: PanBenchmarkOptions): Promise<BenchmarkResult> {
  const legDurationMs = options?.legDurationMs ?? 1500;
  const view = map.getView();
  const viewportSize = map.getSize();
  const originalCenter = view.getCenter();
  const originalZoom = view.getZoom();
  if (!viewportSize || !originalCenter || originalZoom === undefined) {
    throw new Error("map has no size/view yet");
  }

  const refreshIntervalMs = await estimateRefreshInterval();

  // Smallest integer zoom where the extent spans >=3 viewport widths, so the
  // route genuinely pans (~z4 Tyria, ~z6 Mists at 1080p).
  const extent = view.getProjection().getExtent();
  const extentWidth = extent[2] - extent[0];
  const targetResolution = extentWidth / (3 * viewportSize[0]);
  const zoom = clamp(
    Math.ceil(view.getZoomForResolution(targetResolution) ?? originalZoom),
    view.getMinZoom(), view.getMaxZoom());
  const route: Coordinate[] = ROUTE_FRACTIONS.map(([fx, fy]) => [
    extent[0] + fx * (extent[2] - extent[0]),
    extent[1] + fy * (extent[3] - extent[1]),
  ]);

  view.cancelAnimations();
  view.setZoom(zoom);
  view.setCenter(route[0]);

  if (options?.warmup ?? true) {
    await animateRoute(view, route, 400);
    view.setCenter(route[0]);
  }

  // Collectors for the measured run.
  const deltas: number[] = [];
  let renders = 0;
  let lastFrameTime: number | undefined;
  let rafHandle = 0;
  let aborted = false;
  const renderKey = map.on("postrender", () => renders++) as EventsKey;
  const collect = (now: number) => {
    if (!map.getTargetElement()) { // component destroyed mid-run
      aborted = true;
      view.cancelAnimations();
      return;
    }
    if (lastFrameTime !== undefined) {
      const delta = now - lastFrameTime;
      if (delta <= MAX_VALID_DELTA_MS) {
        deltas.push(delta);
      }
    }
    lastFrameTime = now;
    rafHandle = requestAnimationFrame(collect);
  };
  rafHandle = requestAnimationFrame(collect);

  let completed: boolean;
  try {
    completed = await animateRoute(view, route, legDurationMs);
  } finally {
    cancelAnimationFrame(rafHandle);
    unByKey(renderKey);
    if (!aborted) {
      view.cancelAnimations();
      view.setZoom(originalZoom);
      view.setCenter(originalCenter);
    }
  }
  if (aborted) {
    throw new Error("map destroyed during benchmark");
  }
  if (deltas.length === 0) {
    throw new Error("no frames collected");
  }

  const sorted = [...deltas].sort((a, b) => a - b);
  const durationMs = deltas.reduce((a, b) => a + b, 0);
  const avgFrameMs = durationMs / deltas.length;
  const result: BenchmarkResult = {
    totalFrames: deltas.length,
    durationMs: Math.round(durationMs),
    avgFps: round1(1000 / avgFrameMs),
    avgFrameMs: round1(avgFrameMs),
    p95FrameMs: round1(percentile(sorted, 0.95)),
    p99FrameMs: round1(percentile(sorted, 0.99)),
    worstFrameMs: round1(sorted[sorted.length - 1]),
    droppedFrames: deltas.filter(d => d > 1.5 * refreshIntervalMs).length,
    refreshIntervalMs: round1(refreshIntervalMs),
    renders,
    completed,
  };

  // The run parameters make before/after numbers known-comparable — log them.
  console.log(
    `[gw2Bench] zoom ${zoom}, viewport ${viewportSize[0]}x${viewportSize[1]}, ` +
    `${route.length - 1} legs x ${legDurationMs}ms, ~${Math.round(1000 / refreshIntervalMs)}Hz display` +
    (completed ? "" : " — INTERRUPTED, results not comparable"));
  console.table([result]);
  return result;
}

/** One chained animate() call; resolves with OL's "completed" flag (false if a
 * user gesture cancelled the animation). */
function animateRoute(view: View, route: Coordinate[], legDurationMs: number): Promise<boolean> {
  const legs: AnimationOptions[] = route.slice(1).map(center => ({
    center,
    duration: legDurationMs,
    easing: (t: number) => t,
  }));
  return new Promise(resolve => view.animate(...legs, resolve));
}

/**
 * Median of ~20 idle rAF deltas, snapped to a common refresh rate. Dropped
 * frames are classified against this — hardcoding 16.7ms would report ~zero
 * drops on a 144Hz monitor no matter how janky the map is.
 */
export async function estimateRefreshInterval(): Promise<number> {
  const samples: number[] = [];
  let last: number | undefined;
  await new Promise<void>(resolve => {
    const sample = (now: number) => {
      if (last !== undefined && now - last <= MAX_VALID_DELTA_MS) {
        samples.push(now - last);
      }
      last = now;
      if (samples.length >= 20) {
        resolve();
      } else {
        requestAnimationFrame(sample);
      }
    };
    requestAnimationFrame(sample);
  });
  const median = samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)];
  const hz = COMMON_REFRESH_RATES_HZ.reduce((best, rate) =>
    Math.abs(1000 / rate - median) < Math.abs(1000 / best - median) ? rate : best);
  return 1000 / hz;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
export const round1 = (value: number) => Math.round(value * 10) / 10;
export const percentile = (sorted: number[], p: number) => sorted[Math.floor(p * (sorted.length - 1))];
