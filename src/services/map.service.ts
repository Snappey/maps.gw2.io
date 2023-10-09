import {Injectable} from '@angular/core';
import {HttpClient} from "@angular/common/http";
import {Observable} from "rxjs";

export interface MapDetails {
  id:             number;
  name:           string;
  min_level:      number;
  max_level:      number;
  default_floor:  number;
  type:           string;
  floors:         number[];
  region_id:      number;
  region_name:    string;
  continent_id:   number;
  continent_name: string;
  map_rect:       number[][];
  continent_rect: number[][];
}


@Injectable({
  providedIn: 'root'
})
export class MapService {

  constructor(private http: HttpClient) { }

  getDetails(id: number): Observable<MapDetails> {
    return this.http.get<MapDetails>(`https://api.guildwars2.com/v2/maps/${id}`);
  }
}
