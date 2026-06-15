import OlMap from "ol/Map";
import {AnimationOptions} from "ol/View";
import {Coordinate} from "ol/coordinate";
import {EventsKey} from "ol/events";
import {unByKey} from "ol/Observable";
import {gw2ToOl} from "./gw2-projection";
import {BenchmarkResult, estimateRefreshInterval, MAX_VALID_DELTA_MS, percentile, round1} from "./pan-benchmark";

export interface ZoomBenchmarkOptions {
  /** Duration of each zoom/pan animation step; default 400ms (~one wheel notch / short drag). */
  legDurationMs?: number;
  /**
   * Idle pause after every step — the "user looks at the screen" time that
   * lets tile loads, prefetch and the label overlay settle between steps;
   * default 350ms.
   */
  dwellMs?: number;
  /** How many dense areas to visit; default 3. */
  centerCount?: number;
  /**
   * Chat-link index (assets/tiles/<map>.index.json) used as the marker-density
   * source. Without it the benchmark runs the scenario at the current center
   * only.
   */
  indexUrl?: string;
  /** Fast untimed lap first so tiles are cached and runs measure rendering, not network. Default true. */
  warmup?: boolean;
}

/** A dropped frame with the zoom level and scenario phase it occurred in. */
export interface SlowFrame {
  atMs: number;
  frameMs: number;
  zoom: number;
  phase: "zoom-in" | "pan" | "zoom-out";
}

export interface ZoomBenchmarkResult extends BenchmarkResult {
  /** Visited density hot-spots in GW2 continent px, ranked densest first. */
  centers: [number, number][];
  zoomRange: [number, number];
  slowFrames: SlowFrame[];
}

/** Density grid cell edge in continent px — roughly one max-zoom viewport. */
const DENSITY_CELL_PX = 2048;
/** Minimum spacing between chosen centers so distinct regions are visited. */
const CENTER_SPACING_PX = 8192;
/** Pan distance as a viewport fraction for the explore loop and detour. */
const PAN_FRACTION = 0.7;

let running = false;

/**
 * User-scenario zoom benchmark over the densest marker clusters on the map.
 * Each visited hot-spot gets: a step-by-step zoom from min to max with a
 * dwell pause at every level, a pan loop around the hot-spot at max zoom
 * (worst-case icon density), then a stepped zoom back out with a sideways pan
 * detour half-way. Dropped frames are reported with the zoom level and phase
 * they occurred in.
 *
 * Unlike runPanBenchmark's single chained animation, every step here ends its
 * own gesture on purpose: the per-step moveend (fragment write + change
 * detection), the tile-prefetch debounce and the label-overlay settle are all
 * part of what a real user's zoom costs. Expect a default run to take ~45s.
 *
 * Density comes from the chat-link index (every linkable marker, bucketed
 * into viewport-sized cells) — cities and quest hubs rank top, which is
 * exactly where zooming is most expensive.
 *
 * Call from outside the Angular zone.
 */
export function runZoomBenchmark(map: OlMap, options?: ZoomBenchmarkOptions): Promise<ZoomBenchmarkResult> {
  if (running) {
    return Promise.reject(new Error("benchmark already running"));
  }
  running = true;
  return zoomBenchmark(map, options).finally(() => running = false);
}

async function zoomBenchmark(map: OlMap, options?: ZoomBenchmarkOptions): Promise<ZoomBenchmarkResult> {
  const legDurationMs = options?.legDurationMs ?? 400;
  const dwellMs = options?.dwellMs ?? 350;
  const view = map.getView();
  const viewportSize = map.getSize();
  const originalCenter = view.getCenter();
  const originalZoom = view.getZoom();
  if (!viewportSize || !originalCenter || originalZoom === undefined) {
    throw new Error("map has no size/view yet");
  }

  const refreshIntervalMs = await estimateRefreshInterval();
  const minZoom = Math.ceil(view.getMinZoom());
  const maxZoom = Math.floor(view.getMaxZoom());
  const midZoom = Math.round((minZoom + maxZoom) / 2);

  let centers: [number, number][] = [];
  if (options?.indexUrl) {
    try {
      centers = await denseCenters(options.indexUrl, options?.centerCount ?? 3);
    } catch (err) {
      console.warn("[gw2ZoomBench] no density data, using current center:", err);
    }
  }
  if (centers.length === 0) {
    centers = [[Math.round(originalCenter[0]), Math.round(-originalCenter[1])]];
  }
  const olCenters = centers.map(gw2ToOl);

  let phase: SlowFrame["phase"] = "zoom-in";
  const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

  /** One zoom or pan gesture followed by the look-at-the-screen pause. */
  const step = async (animation: AnimationOptions, legMs: number, pauseMs: number): Promise<boolean> => {
    const completed = await new Promise<boolean>(resolve =>
      view.animate({...animation, duration: legMs, easing: t => t}, resolve));
    if (!completed) {
      return false;
    }
    await sleep(pauseMs);
    return true;
  };

  const visitCenter = async (center: Coordinate, legMs: number, pauseMs: number): Promise<boolean> => {
    view.cancelAnimations();
    view.setCenter(center);
    view.setZoom(minZoom);
    await sleep(pauseMs);

    phase = "zoom-in";
    for (let z = minZoom + 1; z <= maxZoom; z++) {
      if (!await step({zoom: z}, legMs, pauseMs)) {
        return false;
      }
    }

    // Explore around the hot-spot at max zoom — worst-case icon density.
    phase = "pan";
    const panW = PAN_FRACTION * viewportSize[0] * (view.getResolution() ?? 1);
    const panH = PAN_FRACTION * viewportSize[1] * (view.getResolution() ?? 1);
    const loop: Coordinate[] = [
      [center[0] - panW, center[1]],
      [center[0], center[1] + panH],
      [center[0] + panW, center[1]],
      [center[0], center[1]],
    ];
    for (const target of loop) {
      if (!await step({center: target}, legMs, pauseMs)) {
        return false;
      }
    }

    phase = "zoom-out";
    for (let z = maxZoom - 1; z >= minZoom; z--) {
      if (!await step({zoom: z}, legMs, pauseMs)) {
        return false;
      }
      if (z === midZoom) {
        // Short sideways look mid-descent, like a user reorienting.
        phase = "pan";
        const detour = PAN_FRACTION * viewportSize[0] * (view.getResolution() ?? 1);
        if (!await step({center: [center[0] + detour, center[1]]}, legMs, pauseMs)
          || !await step({center}, legMs, pauseMs)) {
          return false;
        }
        phase = "zoom-out";
      }
    }
    return true;
  };

  const runRoute = async (legMs: number, pauseMs: number): Promise<boolean> => {
    for (const center of olCenters) {
      if (!await visitCenter(center, legMs, pauseMs)) {
        return false;
      }
    }
    return true;
  };

  if (options?.warmup ?? true) {
    await runRoute(100, 50);
  }

  // Collectors for the measured run.
  const deltas: number[] = [];
  const slowFrames: SlowFrame[] = [];
  let renders = 0;
  let lastFrameTime: number | undefined;
  let rafHandle = 0;
  let aborted = false;
  const startTime = performance.now();
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
        // Log at 2.5x refresh, not the 1.5x dropped-frame threshold: on a
        // high-Hz display single missed vsyncs would flood the log and bury
        // the real spikes.
        if (delta > 2.5 * refreshIntervalMs && slowFrames.length < 100) {
          slowFrames.push({atMs: Math.round(now - startTime), frameMs: round1(delta), zoom: round1(view.getZoom() ?? 0), phase});
        }
      }
    }
    lastFrameTime = now;
    rafHandle = requestAnimationFrame(collect);
  };
  rafHandle = requestAnimationFrame(collect);

  let completed: boolean;
  try {
    completed = await runRoute(legDurationMs, dwellMs);
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
  const result: ZoomBenchmarkResult = {
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
    centers,
    zoomRange: [minZoom, maxZoom],
    slowFrames,
  };

  // The run parameters make before/after numbers known-comparable — log them.
  console.log(
    `[gw2ZoomBench] z${minZoom}<->z${maxZoom} stepped, pan loop at z${maxZoom} + detour at z${midZoom}, ` +
    `${legDurationMs}ms steps + ${dwellMs}ms dwells, ${centers.length} dense centers ` +
    `(${centers.map(c => c.join(",")).join(" | ")}), viewport ${viewportSize[0]}x${viewportSize[1]}, ` +
    `~${Math.round(1000 / refreshIntervalMs)}Hz display` +
    (completed ? "" : " — INTERRUPTED, results not comparable"));
  console.table([{...result, centers: centers.map(c => c.join(",")).join(" | "), slowFrames: slowFrames.length}]);
  if (slowFrames.length > 0) {
    console.table(slowFrames);
  }
  return result;
}

/**
 * Ranks viewport-sized grid cells by marker count and returns the centroids
 * of the densest, mutually distant cells (GW2 continent px).
 */
async function denseCenters(indexUrl: string, count: number): Promise<[number, number][]> {
  const response = await fetch(indexUrl);
  if (!response.ok) {
    throw new Error(`${indexUrl}: HTTP ${response.status}`);
  }
  const index: {[chatLink: string]: {coord?: [number, number]}} = await response.json();
  const cells = new Map<string, {count: number; sumX: number; sumY: number}>();
  for (const entry of Object.values(index)) {
    if (!entry.coord) {
      continue;
    }
    const key = `${Math.floor(entry.coord[0] / DENSITY_CELL_PX)}|${Math.floor(entry.coord[1] / DENSITY_CELL_PX)}`;
    const cell = cells.get(key) ?? {count: 0, sumX: 0, sumY: 0};
    cell.count++;
    cell.sumX += entry.coord[0];
    cell.sumY += entry.coord[1];
    cells.set(key, cell);
  }

  const picked: [number, number][] = [];
  for (const cell of [...cells.values()].sort((a, b) => b.count - a.count)) {
    const x = cell.sumX / cell.count;
    const y = cell.sumY / cell.count;
    if (picked.every(p => Math.hypot(p[0] - x, p[1] - y) >= CENTER_SPACING_PX)) {
      picked.push([Math.round(x), Math.round(y)]);
      if (picked.length >= count) {
        break;
      }
    }
  }
  return picked;
}
