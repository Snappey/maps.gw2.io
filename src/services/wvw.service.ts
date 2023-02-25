import { Injectable } from '@angular/core';
import {HttpClient} from "@angular/common/http";
import {
  forkJoin,
  map,
  Observable,
  tap,
  combineLatest,
  switchMap,
} from "rxjs";
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

export interface WorldNames {
  [team: string]: string[];
  red: string[];
  blue: string[];
  green: string[];
}

export interface FriendlyWorldNames {
  [team: string]: string;
  red: string;
  blue: string;
  green: string;
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
  friendlyOwner: string;
  last_flipped: Date;
  points_tick: number;
  points_capture: number;
  claimed_by: string;
  claimed_at?: Date;
  yaks_delivered?: number;
  guild_upgrades: string[];
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
  tier: string;
  region: string;
  deaths: Scores;
  kills: Scores;
  victory_points: Scores;
  skirmishes: Skirmish[];
  maps: Map[];

  // Custom
  all_worlds: WorldNames;
  all_worlds_names: WorldNames
  friendly_names: FriendlyWorldNames
  objectives: MergedObjective[]
}

export interface MatchOverview {
  id: string;
  worlds: Scores;
  all_worlds: WorldNames;
  start_time: Date;
  end_time: Date;
}

export interface World {
  id: string;
  name: string;
  population: string;
}

export interface WorldDictionary {
  [id: string]: World;
}

export interface Upgrade {
  name: string;
  description: string;
  icon: string;
}

export interface Tier {
  name: string;
  yaks_required: number;
  upgrades: Upgrade[];
}

export interface ObjectiveTiers {
  id: number;
  tiers: Tier[];
}

export interface MergedObjective extends MatchObjective, Objective {}

@Injectable({
  providedIn: 'root'
})
export class WvwService {

  constructor(private httpClient: HttpClient, private guildService: GuildService) { }

  listObjectives(): Observable<string[]> {
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

  getAllMatchDetails(): Observable<Match[]> {
    return this.httpClient.get<string[]>(`https://api.guildwars2.com/v2/wvw/matches`)
      .pipe(
        switchMap(ids => combineLatest(ids.map(id => this.getMatchDetails(id))))
      )
  }

  getObjectiveTiers(id: number): Observable<ObjectiveTiers> {
    return this.httpClient.get<ObjectiveTiers>(`https://api.guildwars2.com/v2/wvw/upgrades/${id}`)
  }

  private mapWorldNames(match: Match): Observable<Match> {
    const worldNames = this.getWorldNames(Object.values(match.all_worlds).flat());
    return forkJoin([worldNames]).pipe(
      map(src => {
        const names = src[0]
        const mapNames = (ids: string[]) => ids.map(id => {
          if (id in names) {
            return names[id].name;
          }
          return "unknown"
        });

        match.all_worlds_names = {
          red: mapNames(match.all_worlds.red),
          green: mapNames(match.all_worlds.green),
          blue: mapNames(match.all_worlds.blue)
        }
        match.friendly_names = {
          red: match.all_worlds_names.red.join(", "),
          green: match.all_worlds_names.green.join(", "),
          blue: match.all_worlds_names.blue.join(", ")
        }
        match.tier = this.getTier(match);
        match.region = this.getRegion(match);

        return match;
      })
    )
  }

  private mapObjectives(match: Match): Observable<Match> {
    return forkJoin([this.getAllObjectives()]).pipe(
      map(src => {
        const objectives = src[0]
        const matchObj = match.maps.map(m => m.objectives).flat();
        match.objectives = matchObj.reduce((res: MergedObjective[], matchObj) => {
          const obj = objectives.find(o => matchObj.id === o.id);
          if (obj) {
            res.push({...obj, ...matchObj, friendlyOwner: match.friendly_names[matchObj.owner.toLowerCase()]})
          }

          return res;
        }, []);

        return match;
      })
    )
  }

  getTier(match: Match): string {
    return match.id.split("-")[1];
  }

  getRegion(match: Match): string {
    return match.id.split("-")[0] === "1" ? "us" : "eu";
  }

  getMatchDetails(id: string): Observable<Match> {
    return this.httpClient.get<Match>(`https://api.guildwars2.com/v2/wvw/matches/${id}`)
      .pipe(
        switchMap(match => this.mapWorldNames(match)),
        switchMap(match => this.mapObjectives(match))
      );
  }

  getMatchDetailsByWorldId(worldId: string): Observable<Match> {
    return this.httpClient.get<Match>(`https://api.guildwars2.com/v2/wvw/matches?world=${worldId}`)
      .pipe(
        switchMap(match => this.mapWorldNames(match))
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

  getMatchOverviewByWorldId(worldId: number): Observable<MatchOverview> {
    return this.httpClient.get<MatchOverview>(`https://api.guildwars2.com/v2/wvw/matches/overview?world=${worldId}`)
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

  calculateUpgradeProgress(yaksDelivered: number | undefined, friendlyUpgradeLevel: string): number {
    if (yaksDelivered === undefined) {
      return 0;
    }

    switch (friendlyUpgradeLevel) {
      case "Secured":
        return Math.max(yaksDelivered, 0)
      case "Reinforced":
        return Math.max(yaksDelivered - 20, 0)
      case "Fortified":
        return Math.max(yaksDelivered - 60, 0);
      default:
        return Math.max(yaksDelivered, 0);
    }
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

  hasUpgradeLevel(yaksDelivered: number | undefined, friendlyUpgradeLevel: string): boolean {
    if (yaksDelivered === undefined) {
      return false;
    }

    switch (friendlyUpgradeLevel) {
      case "Secured":
        return yaksDelivered >= 20;
      case "Reinforced":
        return yaksDelivered >= 60;
      case "Fortified":
        return yaksDelivered >= 140;
      default:
        return false;
    }
  }

  calculateMatchPointsTick(match: Match, team: string): number {
    return match.maps.flat()
      .map(o => o.objectives).flat()
      .filter(o => o.owner.toLowerCase() === team.toLowerCase())
      .map(o => o.points_tick).reduce((total, cur) => total + cur);
  }
}
