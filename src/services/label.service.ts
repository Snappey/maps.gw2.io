import { Injectable } from '@angular/core';
import {Marker, Map, PointTuple} from "leaflet";
import * as L from 'leaflet';
import "../lib/leafet-canvas-markers";

export interface CanvasIcon {
  size: number[]
  url: string
  position: "top" | "bottomRight" | "bottomLeft"
  offset: number[]
}

@Injectable({
  providedIn: 'root'
})
export class LabelService {

  constructor() { }

  public createCanvasMarker(leaflet: Map, coordinates: PointTuple, image: string, rotation: number = 0, size: number[] = [32,32], radius: number = 16, icons: CanvasIcon[] = []): Marker {
    // @ts-ignore
    return L.canvasMarker(leaflet.unproject(coordinates, leaflet.getMaxZoom()),
    {
      radius: radius,
      overlayIcons: icons,
      img: {
        url: image,
        rotate: rotation,
        size: size,
      }
    });
  }
}
