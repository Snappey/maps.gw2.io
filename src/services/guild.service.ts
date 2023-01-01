import { Injectable } from '@angular/core';
import {HttpClient} from "@angular/common/http";
import {
  forkJoin,
  concatMap,
  exhaustMap,
  map,
  mergeAll,
  mergeMap,
  Observable,
  zip,
  reduce,
  switchMap,
  tap,
  of
} from "rxjs";
import {combineLatest} from "rxjs/internal/operators/combineLatest";


export interface Layer {
  id: number;
  colors: number[];
}

export interface Emblem {
  background: Layer;
  foreground: Layer;
  flags: string[];
}

export interface Guild {
  level?: number;
  motd?: string;
  influence?: number;
  aetherium?: number;
  resonance?: number;
  favor?: number;

  id: string;
  name: string;
  tag: string;
  emblem?: Emblem;
}


@Injectable({
  providedIn: 'root'
})
export class GuildService {
  guildCache: {[id: string]: Guild}

  constructor(private httpClient: HttpClient) {
    this.guildCache = {};
  }

  getGuild(id: string): Observable<Guild> {
    if (id in this.guildCache) {
      return of(this.guildCache[id])
    }

    return this.httpClient.get<Guild>(`https://api.guildwars2.com/v2/guild/${id}`)
      .pipe(
        tap(guild => this.guildCache[guild.id] = guild)
      );
  }
}
