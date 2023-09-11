import { Injectable } from '@angular/core';
import {from, map, Observable, of, share, shareReplay, tap} from "rxjs";
import {HttpClient} from "@angular/common/http";
import {PointTuple} from "leaflet";

export type BoundsTuple = [[number, number], [number, number]]
export type MarkerType = "waypoint" | "poi" | "vista" | "unlock" | string;
export type RegionLabelType = "Map" | "Region";
export type MasteryType = "Tyria" | "Maguuma" | "Desert" | "Tundra" | "Cantha" | "Skies of Tyria";

export interface RegionLabel {
  type: RegionLabelType;
  label_coordinates: PointTuple;
  coordinates: BoundsTuple;
  heading: string;
  subheading: string;
}

export interface MarkerLabel {
  id: string;
  coordinates: PointTuple,
  type: MarkerType;
  data: any;
  continent?: string;
  map?: string;
}

export interface WikiMarkerLabel {
  coord: PointTuple,
  name: string;
  icon: string;
  text?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AssetService {

  constructor(private http: HttpClient) { }


  fetchRegionLabels(continentId: number, floorId: number): Observable<RegionLabel[]> {
    return from(import(`../assets/data/region_labels_${continentId}_${floorId}.json`)).pipe(
      map(data => data.default)
    );
  }

  fetchPointOfInterestLabels(continentId: number, floorId: number): Observable<MarkerLabel[]> {
    return from(import(`../assets/data/poi_labels_${continentId}_${floorId}.json`)).pipe(
      map(data => data.default)
    )
  }

  fetchAdventureLabels(): Observable<MarkerLabel[]> {
    return from(import("../assets/data/adventure_labels.json")).pipe(
      map(data => data.default),
      map(data => data as MarkerLabel[]) // TODO: Remove this awful type casting
    );
  }

  fetchCityLabels(): Observable<WikiMarkerLabel[]> {
    return from(import("../assets/data/city_markers.json")).pipe(
      map(data => data.default),
      map(data => data as WikiMarkerLabel[])
    );
  }
}
