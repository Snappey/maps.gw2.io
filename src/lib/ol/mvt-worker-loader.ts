import VectorTile from "ol/VectorTile";
import TileState from "ol/TileState";
import type {Extent} from "ol/extent";
import type Projection from "ol/proj/Projection";
import type Feature from "ol/Feature";
import {PMTilesVectorSource} from "ol-pmtiles";
import {throttleVectorTileParsing} from "./vt-parse-queue";
import {fromRecord, type DecodeRequest, type DecodeResponse} from "./mvt-feature-transfer";

export function attachWorkerVectorTileParsing(
  source: PMTilesVectorSource,
  busy: () => boolean,
  layers: string[],
): () => void {
  let worker: Worker;
  try {
    worker = new Worker(new URL("./mvt-decode.worker", import.meta.url));
  } catch (err) {
    console.warn("[mvt-worker-loader] worker unavailable, decoding on main thread:", err);
    throttleVectorTileParsing(source, busy);
    return () => {};
  }

  // In-flight decodes keyed by request id so a reply finds its tile. Every request
  // gets exactly one reply, so entries never leak.
  const pending = new Map<number, VectorTile<Feature>>();
  let nextId = 0;

  worker.onmessage = ({data}: MessageEvent<DecodeResponse>) => {
    const tile = pending.get(data.id);
    if (!tile) {
      return;
    }
    pending.delete(data.id);
    if (tile.getState() !== TileState.LOADING) {
      return; // disposed/aborted while the worker was decoding
    }
    if (data.error || !data.features) {
      tile.setState(TileState.ERROR);
      return;
    }
    tile.setFeatures(data.features.map(fromRecord) as unknown as Feature[]); // flips to LOADED
  };

  source.setTileLoadFunction((tile, url) => {
    const vtile = tile as VectorTile<Feature>;
    const match = /pmtiles:\/\/(\d+)\/(\d+)\/(\d+)/.exec(url);
    if (!match) {
      throw new Error("Could not parse tile URL: " + url);
    }
    const [z, x, y] = [+match[1], +match[2], +match[3]];
    vtile.setLoader((extent: Extent, _resolution: number, _projection: Projection) => {
      source.pmtiles_.getZxy(z, x, y).then(result => {
        if (vtile.getState() !== TileState.LOADING) {
          return; // disposed/aborted while fetching
        }
        if (!result) {
          vtile.setFeatures([]);
          vtile.setState(TileState.EMPTY);
          return;
        }
        const id = nextId++;
        pending.set(id, vtile);
        // result.data is a fresh per-tile buffer (in-memory source slice()s, fetch
        // source allocates), so transferring it never detaches the shared archive.
        const bytes = result.data as ArrayBuffer;
        worker.postMessage({id, extent, layers, bytes} satisfies DecodeRequest, [bytes]);
      }).catch(() => {
        vtile.setFeatures([]);
        vtile.setState(TileState.ERROR);
      });
    });
  });

  return () => {
    worker.terminate();
    pending.clear();
  };
}
