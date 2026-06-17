import MVT from "ol/format/MVT";
import {toRecord, type DecodeRequest, type DecodeResponse, type FeatureRecord} from "./mvt-feature-transfer";

interface WorkerScope {
  onmessage: ((event: MessageEvent<DecodeRequest>) => void) | null;
  postMessage(message: DecodeResponse, transfer?: Transferable[]): void;
}
const ctx = self as unknown as WorkerScope;

// One MVT format per distinct layer set (the two maps style different layers);
// readFeatures filters to `layers`, so memoizing avoids rebuilding it per tile.
const formats = new Map<string, MVT>();
const formatFor = (layers: string[]): MVT => {
  const key = layers.join(",");
  let format = formats.get(key);
  if (!format) {
    format = new MVT({layers});
    formats.set(key, format);
  }
  return format;
};

ctx.onmessage = ({data}) => {
  const {id, extent, layers, bytes} = data;
  try {
    const features = formatFor(layers).readFeatures(bytes, {extent});
    const records: FeatureRecord[] = new Array(features.length);
    const transfer: Transferable[] = new Array(features.length);
    for (let i = 0; i < features.length; i++) {
      const rec = toRecord(features[i]);
      records[i] = rec;
      transfer[i] = rec.flat.buffer;
    }
    ctx.postMessage({id, features: records}, transfer);
  } catch (err) {
    ctx.postMessage({id, error: err instanceof Error ? err.message : String(err)});
  }
};
