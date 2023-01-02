import { Injectable } from '@angular/core';
import {HttpClient} from "@angular/common/http";
import {forkJoin, concatMap, exhaustMap, map, mergeAll, mergeMap, Observable, zip, reduce, switchMap} from "rxjs";
import {combineLatest} from "rxjs/internal/operators/combineLatest";
import {GuildService} from "./guild.service";

export interface Objective {
  id: string;
  name: string;
  sector_id: number;
  type: string;
  map_type: string;
  map_id: number;
  upgrade_id: number;
  coord: number[];
  label_coord: number[];
  marker: string;
  chat_link: string;
}

export interface Scores {
  [team: string]: number;
  red: number;
  blue: number;
  green: number;
}

export interface AllWorlds {
  [team: string]: string[];
  red: string[];
  blue: string[];
  green: string[];
}

export interface MapScore {
  type: string;
  scores: Scores;
}

export interface Skirmish {
  id: number;
  scores: Scores;
  map_scores: MapScore[];
}

export interface Bonus {
  type: string;
  owner: string;
}

export interface MatchObjective {
  id: string;
  type: string;
  owner: string;
  last_flipped: Date;
  points_tick: number;
  points_capture: number;
  claimed_by: string;
  claimed_at?: Date;
  yaks_delivered?: number;
  guild_upgrades: number[];
}

export interface Map {
  id: number;
  type: string;
  scores: Scores;
  bonuses: Bonus[];
  objectives: MatchObjective[];
  deaths: Scores;
  kills: Scores;
}

export interface Match {
  id: string;
  start_time: Date;
  end_time: Date;
  scores: Scores;
  worlds: Scores;
  all_worlds: AllWorlds;
  all_worlds_names: AllWorlds // Custom
  deaths: Scores;
  kills: Scores;
  victory_points: Scores;
  skirmishes: Skirmish[];
  maps: Map[];
}

export interface World {
  id: string;
  name: string;
  population: string;
}

export interface WorldDictionary {
  [id: string]: World;
}

export interface MergedObjective extends MatchObjective, Objective {}

@Injectable({
  providedIn: 'root'
})
export class WvwService {

  constructor(private httpClient: HttpClient, private guildService: GuildService) { }

  getObjectives(): Observable<string[]> {
    return this.httpClient.get<string[]>(`https://api.guildwars2.com/v2/wvw/objectives`);
  }

  getObjectiveDetails(id: string): Observable<Objective> {
    return this.httpClient.get<Objective>(`https://api.guildwars2.com/v2/wvw/objectives/${id}`);
  }

  getAllObjectives(): Observable<Objective[]> {
    return this.httpClient.get<Objective[]>(`/assets/data/mists_objectives.json`);
    /*return this.getObjectives()
      .pipe(
        exhaustMap((objectiveIds) =>
          zip(...objectiveIds.map(id => this.getObjectiveDetails(id)))
        )
      );*/
  }

  getMatchDetails(id: string): Observable<Match> {
    return this.httpClient.get<Match>(`https://api.guildwars2.com/v2/wvw/matches/${id}`);
  }

  getMatchDetailsByWorldId(worldId: string): Observable<Match> {
    return this.httpClient.get<Match>(`https://api.guildwars2.com/v2/wvw/matches?world=${worldId}`)
      .pipe(
        switchMap(match => {
          const worldNames = this.getWorldNames(Object.values(match.all_worlds).flat());
          return forkJoin({names: worldNames}).pipe(
            map(world => {
              const mapNames = (ids: string[]) => ids.map(id => {
                if (id in world.names) {
                  return world.names[id].name;
                }
                return "unknown"
              });

              match.all_worlds_names = {
                red: mapNames(match.all_worlds.red),
                green: mapNames(match.all_worlds.green),
                blue: mapNames(match.all_worlds.blue)
              }

              return match;
            })
          )
        })
      );
  }

  getWorldNames(ids: string[]): Observable<WorldDictionary> {
    return this.httpClient.get<World[]>(`https://api.guildwars2.com/v2/worlds?ids=${ids.join(",")}`)
      .pipe(
        map(worlds => worlds.reduce((res: WorldDictionary, cur) => {
          if (!(cur.id in res)) {
            res[cur.id] = cur;
          }

          return res;
        }, {}))
      )
  }

  getAllWorlds(): Observable<World[]> {
    return this.httpClient.get<World[]>(`https://api.guildwars2.com/v2/worlds?ids=all`);
  }

  private getLastDayOccurence (date: Date, day: "sun" | "mon" | "tue" | "wed" | "thurs" | "fri" | "sat"): Date {
    const d = new Date(date.getTime());
    const days = ['sun', 'mon', 'tue', 'wed', 'thurs', 'fri', 'sat'];
    if (days.includes(day)) {
      const modifier = (d.getDay() + days.length - days.indexOf(day)) % 7 || 7;
      d.setDate(d.getDate() - modifier);
    }
    return d;
  }

  getLastResetTime(region: "eu" | "us"): Date | undefined {
    let resetDay = undefined;
    switch(region) {
      case "eu":
        resetDay = this.getLastDayOccurence(new Date(), "fri")
        resetDay.setHours(18, 0, 0)
        break;
      case "us":
        resetDay = this.getLastDayOccurence(new Date(), "sat")
        resetDay.setHours(2, 0, 0)
    }

    return resetDay;
  }

  calculateUpgradeLevel(yaksDelivered: number | undefined): number {
    if (yaksDelivered === undefined) {
      return 0;
    }

    if (yaksDelivered >= 140) {
      return 3;
    } else {
      if (yaksDelivered >= 20) {
        return yaksDelivered >= 60 ? 2 : 1;
      }
    }
    return 0
  }

  getFriendlyUpgradeLevel(level: number): string {
    switch(level) {
      case 3:
        return "Fortified";
      case 2:
        return "Reinforced";
      case 1:
        return "Secured";
      default:
        return "N/A"
    }
  }
}
