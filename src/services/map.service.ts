import {Injectable} from '@angular/core';
import {HttpClient} from "@angular/common/http";
import {catchError, Observable, shareReplay, throwError} from "rxjs";

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

/**
 * Subset of a map record the dynamic-floor feature needs: supported floors and
 * the continent-pixel box, so a view position resolves to the floors available
 * there. `continent_rect` is `[[minX, minY], [maxX, maxY]]` in GW2 continent
 * pixels (same space as `Gw2MapConfig.width/height` and `olToGw2()`).
 */
export interface MapFloorInfo {
  id:             number;
  name:           string;
  continent_id:   number;
  default_floor:  number;
  floors:         number[];
  continent_rect: number[][];
  /** Map bounds in GW2 world units (inches), Y increasing north. Used to place
   *  TacO markers, whose positions are world coords — see src/lib/taco. */
  map_rect:       number[][];
}


@Injectable({
  providedIn: 'root'
})
export class MapService {

  /** One shared `/v2/maps?ids=all` fetch for the whole session (~400 maps). */
  private allMaps$?: Observable<MapFloorInfo[]>;

  constructor(private http: HttpClient) { }

  getDetails(id: number): Observable<MapDetails> {
    return this.http.get<MapDetails>(`https://api.guildwars2.com/v2/maps/${id}`);
  }

  getAllMaps(): Observable<MapFloorInfo[]> {
    if (!this.allMaps$) {
      // shareReplay caches the (large) result and dedupes concurrent callers
      // (both map components ask on init). Evict on error so a transient
      // failure doesn't poison the cache — callers degrade by hiding the picker.
      this.allMaps$ = this.http
        .get<MapFloorInfo[]>(`https://api.guildwars2.com/v2/maps?ids=all`)
        .pipe(
          catchError(err => {
            this.allMaps$ = undefined;
            return throwError(() => err);
          }),
          shareReplay({bufferSize: 1, refCount: false}),
        );
    }
    return this.allMaps$;
  }
}
