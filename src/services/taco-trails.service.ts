import {HttpClient} from "@angular/common/http";
import {Injectable} from "@angular/core";
import {catchError, Observable, of, shareReplay} from "rxjs";

import {UserLayer} from "./user-layer.service";

/**
 * Loads the bundled TacO overlay layers committed by generate_taco_trails.mjs —
 * one UserLayer per whitelisted source file (TACO_TRAILS in config.mjs), already
 * in GW2 continent pixels with local icon URLs. Shared via shareReplay so both
 * maps register their layers without re-fetching; a missing file degrades to no
 * layers rather than breaking map init.
 */
@Injectable({providedIn: "root"})
export class TacoTrailsService {
  private readonly layers$: Observable<UserLayer[]>;

  constructor(private http: HttpClient) {
    this.layers$ = this.http.get<UserLayer[]>("assets/data/taco_trails.json").pipe(
      catchError(() => of<UserLayer[]>([])),
      shareReplay({bufferSize: 1, refCount: false}),
    );
  }

  getLayers(): Observable<UserLayer[]> {
    return this.layers$;
  }
}
