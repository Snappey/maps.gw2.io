import RenderFeature, {type Type} from "ol/render/Feature";
import type {Extent} from "ol/extent";

export interface DecodeRequest {
  id: number;
  extent: Extent;
  layers: string[];
  bytes: ArrayBuffer;
}

export interface FeatureRecord {
  type: string;
  flat: Float64Array;
  ends: number[] | null;
  props: {[key: string]: unknown};
  id: number | string | undefined;
}

export interface DecodeResponse {
  id: number;
  features?: FeatureRecord[];
  error?: string;
}

interface RenderFeatureInternals {
  type_: string;
  flatCoordinates_: number[];
  ends_: number[] | null;
  properties_: {[key: string]: unknown};
  id_: number | string | undefined;
}

export function toRecord(feature: RenderFeature): FeatureRecord {
  const f = feature as unknown as RenderFeatureInternals;
  return {
    type: f.type_,
    flat: new Float64Array(f.flatCoordinates_),
    ends: f.ends_,
    props: f.properties_,
    id: f.id_,
  };
}

export function fromRecord(rec: FeatureRecord): RenderFeature {
  return new RenderFeature(rec.type as Type, Array.from(rec.flat), rec.ends as number[], 2, rec.props, rec.id);
}
