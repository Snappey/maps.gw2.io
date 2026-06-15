import VectorTile from "ol/VectorTile";
import TileState from "ol/TileState";
import {Extent} from "ol/extent";
import Projection from "ol/proj/Projection";
import Feature from "ol/Feature";
import {PMTilesVectorSource} from "ol-pmtiles";

/**
 * Max MVT decode time per frame while the view is moving. Don't shrink it
 * below the tile arrival rate: every tile that flips to LOADED triggers a
 * re-render (executor build + full-viewport canvas upload), so trickling a
 * burst over many frames costs MORE total frame time than clearing it in a
 * few — measured 4ms ≈ 4x more >20ms frames than 8ms on a 165Hz display.
 */
const BUSY_BUDGET_MS = 8;
/** While the view is static a long frame is invisible; clear the backlog. */
const IDLE_BUDGET_MS = 16;

const queue: Array<() => void> = [];
let scheduled = false;
let isBusy: (() => boolean) | undefined;

function drain(): void {
  scheduled = false;
  const deadline = performance.now() + (isBusy?.() ? BUSY_BUDGET_MS : IDLE_BUDGET_MS);
  // Always make progress, even if a single tile exceeds the budget.
  do {
    queue.shift()!();
  } while (queue.length > 0 && performance.now() < deadline);
  if (queue.length > 0 && !scheduled) {
    scheduled = true;
    requestAnimationFrame(drain);
  }
}

function enqueue(job: () => void): void {
  queue.push(job);
  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(drain);
  }
}

/**
 * Replaces the source's tile loader (a copy of ol-pmtiles' own) with one that
 * funnels the MVT decode through a frame-budgeted queue: fetches still run
 * concurrently, but at most ~FRAME_BUDGET_MS of parsing happens per rendered
 * frame. Without this, several tile fetches resolving together decode
 * back-to-back inside one frame — the dominant pan-spike cost when profiled
 * (pbf readSVarint / MVT readRawGeometry in 25-60ms frames).
 *
 * Call from outside the Angular zone (the queue drains on rAF). `busy`
 * reports whether the view is animating/interacting — moving frames get the
 * small budget, static frames clear the backlog.
 */
export function throttleVectorTileParsing(source: PMTilesVectorSource, busy: () => boolean): void {
  isBusy = busy;
  source.setTileLoadFunction((tile, url) => {
    const vtile = tile as VectorTile<Feature>;
    const match = /pmtiles:\/\/(\d+)\/(\d+)\/(\d+)/.exec(url);
    if (!match) {
      throw new Error("Could not parse tile URL: " + url);
    }
    const [z, x, y] = [+match[1], +match[2], +match[3]];
    vtile.setLoader((extent: Extent, resolution: number, projection: Projection) => {
      source.pmtiles_.getZxy(z, x, y).then(result => {
        if (!result) {
          vtile.setFeatures([]);
          vtile.setState(TileState.EMPTY);
          return;
        }
        enqueue(() => {
          if (vtile.getState() !== TileState.LOADING) {
            return; // disposed or aborted while queued
          }
          vtile.setFeatures(vtile.getFormat().readFeatures(result.data, {
            extent,
            featureProjection: projection,
          }) as Feature[]);
          vtile.setState(TileState.LOADED);
        });
      }).catch(() => {
        vtile.setFeatures([]);
        vtile.setState(TileState.ERROR);
      });
    });
  });
}
