import {Injectable} from '@angular/core';
import {HttpClient} from "@angular/common/http";
import {Observable, of, tap} from "rxjs";

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

export interface GuildUpgrade {
  id: number;
  name: string;
  description: string;
  build_time: number;
  icon: string;
  type: string;
  required_level: number;
  experience: number;
  prerequisites: number[];
  costs: {
    type: string;
    count: number;
    name: string;
    item_id: number;
  }[];
}


@Injectable({
  providedIn: 'root'
})
export class GuildService {
  guildCache: {[id: string]: Guild}
  guildUpgradeCache: {[id: string]: GuildUpgrade};

  constructor(private httpClient: HttpClient) {
    this.guildCache = {};
    this.guildUpgradeCache = {};
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

  getGuildUpgrade(id: string): Observable<GuildUpgrade> {
    if (id in this.guildUpgradeCache) {
      return of(this.guildUpgradeCache[id])
    }

    return this.httpClient.get<GuildUpgrade>(`https://api.guildwars2.com/v2/guild/upgrades/${id}`)
      .pipe(
        tap(upgrade => this.guildUpgradeCache[upgrade.id] = upgrade)
      );
  }
}
