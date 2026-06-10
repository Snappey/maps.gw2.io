import {Feature} from "ol";
import {FeatureLike} from "ol/Feature";
import Point from "ol/geom/Point";
import VectorSource from "ol/source/Vector";
import {MarkerType} from "../editor-types";
import {gw2ToOl} from "./gw2-projection";
import {iconStyle, labelStyle} from "./marker-styles";

export interface EditorMetadata {
  [key: string]: string | number | boolean;
}

interface EditorEntry {
  id: number;
  coordinates: [number, number];
  type: string;
  data: EditorMetadata;
}

/**
 * Dev-only marker/text placement state for the OL map — replaces the
 * Leaflet-coupled EditorService internals while keeping the same exported
 * JSON shape (id/coordinates/type/data) the data scripts expect.
 */
export class OlEditor {
  readonly markersSource = new VectorSource();
  readonly textSource = new VectorSource();

  private markers: EditorEntry[] = [];
  private text: EditorEntry[] = [];

  addMarker(type: MarkerType, coordinates: [number, number], metadata: EditorMetadata) {
    const feature = new Feature({geometry: new Point(gw2ToOl(coordinates))});
    feature.setId(this.entryId(coordinates));
    feature.setProperties({
      layer: "editor",
      tooltip: typeof metadata["tooltip"] === "string" ? metadata["tooltip"] : MarkerType[type],
      chat_link: typeof metadata["chatLink"] === "string" ? metadata["chatLink"] : "",
    });
    feature.setStyle(iconStyle(this.getIcon(type, metadata)));
    this.markersSource.addFeature(feature);

    this.markers.push({
      id: this.entryId(coordinates),
      coordinates,
      type: MarkerType[type].toLowerCase(),
      data: metadata,
    });
  }

  addText(type: MarkerType.Region | MarkerType.Map, coordinates: [number, number], metadata: EditorMetadata) {
    const heading = String(metadata["heading"] ?? "");
    const kind = type === MarkerType.Region ? "region" : "map";

    const feature = new Feature({geometry: new Point(gw2ToOl(coordinates))});
    feature.setId(this.entryId(coordinates));
    feature.set("layer", "editor_text");
    feature.setStyle((_, resolution) => labelStyle(kind, heading, resolution));
    this.textSource.addFeature(feature);

    this.text.push({
      id: this.entryId(coordinates),
      coordinates,
      type: MarkerType[type].toLowerCase(),
      data: metadata,
    });
  }

  /** Right-clicking a placed marker removes it, like the old editor. */
  removeFeature(feature: FeatureLike): boolean {
    const id = feature.getId?.();
    if (id === undefined) {
      return false;
    }
    for (const [source, entries] of [[this.markersSource, this.markers], [this.textSource, this.text]] as const) {
      const found = source.getFeatureById(id as number);
      if (found) {
        source.removeFeature(found);
        const index = entries.findIndex(e => e.id === id);
        if (index >= 0) {
          entries.splice(index, 1);
        }
        return true;
      }
    }
    return false;
  }

  exportMarkers = (): string => JSON.stringify(this.markers, undefined, "\t");
  exportText = (): string => JSON.stringify(this.text, undefined, "\t");

  private entryId = (coordinates: [number, number]): number =>
    Math.floor(coordinates[0] + coordinates[1]);

  private getIcon(type: MarkerType, metadata: EditorMetadata): string {
    switch (type) {
      case MarkerType.Waypoint:
        return "assets/waypoint.png";
      case MarkerType.Vista:
        return "assets/vista.png";
      case MarkerType.Heart:
        return "assets/hearts.png";
      case MarkerType.SkillPoint:
        return "assets/heropoint.png";
      case MarkerType.Mastery:
        return `assets/${metadata["type"] ?? "core"}_mastery.png`;
      case MarkerType.Unlock:
        return typeof metadata["icon"] === "string" && metadata["icon"] ? metadata["icon"] : "assets/poi.png";
      case MarkerType.Poi:
      default:
        return "assets/poi.png";
    }
  }
}
