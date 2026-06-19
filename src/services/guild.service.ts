import {Injectable} from '@angular/core';
import { HttpClient } from "@angular/common/http";
import {Observable} from "rxjs";
import {cacheById} from "../lib/http-cache";

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
  private readonly guildCache: {[id: string]: Observable<Guild>} = {};
  private readonly guildUpgradeCache: {[id: string]: Observable<GuildUpgrade>} = {};

  constructor(private httpClient: HttpClient) {}

  getGuild(id: string): Observable<Guild> {
    return cacheById(this.guildCache, id, () =>
      this.httpClient.get<Guild>(`https://api.guildwars2.com/v2/guild/${id}`));
  }

  getGuildUpgrade(id: string): Observable<GuildUpgrade> {
    return cacheById(this.guildUpgradeCache, id, () =>
      this.httpClient.get<GuildUpgrade>(`https://api.guildwars2.com/v2/guild/upgrades/${id}`));
  }
}
