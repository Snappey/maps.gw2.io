import {Injectable} from '@angular/core';
import {HttpClient} from "@angular/common/http";
import {map, Observable} from "rxjs";
import {MapService} from "./map.service";

interface Continent {
  texture_dims: number[]
  clamped_view: number[]
  regions: Region[]
}

interface Region {
  name: string
  label_coord: number[]
  continent_rect: number[][]
  maps: {[key: number]: Map}
  id: number
}

interface Map {
  name: string
  min_level: number
  max_level: number
  default_floor: number
  label_coord: number[]
  map_rect: number[][]
  continent_rect: number[][]
  points_of_interest: any
  tasks: any
  skill_challenges: any
  sectors: any
  adventures: any
  mastery_points: any
  id: number
}

export interface MapLabel {
  type: string;
  coords: number[]
  rect_coords: number[][]
  heading: string
  subheading: string
}

@Injectable({
  providedIn: 'root'
})
export class ContinentService {
  constructor(private http: HttpClient, private mapService: MapService) { }

  getContinent(id: number): Observable<Continent[]> {
    return this.http.get<Continent[]>(`https://api.guildwars2.com/v2/continents/${id}/floors?ids=1`)
  }

  getMapLabels(continentId: number): Observable<MapLabel[]> {
    return this.getContinent(continentId)
      .pipe(
        map((v, idx): MapLabel[] => {
          const labels: MapLabel[] = [];

          v.forEach(c => {
            Object.values(c.regions).forEach(r => {
              labels.push({
                coords: r.label_coord,
                heading: r.name,
                subheading: "",
                rect_coords: r.continent_rect,
                type: "Region"
              })

              for (let k in r.maps) {
                const map = r.maps[k];

                labels.push({
                  coords: map.label_coord,
                  heading: map.name,
                  subheading: map.min_level === map.max_level ? `${map.max_level}` : `${map.min_level} - ${map.max_level}`,
                  rect_coords: map.continent_rect,
                  type: "Map"
                })
              }
            })
          });

          return labels;
        }
      )
    );
  }
}
