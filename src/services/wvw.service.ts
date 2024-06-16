import {Injectable} from '@angular/core';
import {HttpClient} from "@angular/common/http";
import {combineLatest, forkJoin, map, Observable, of, switchMap,} from "rxjs";
import {GuildService} from "./guild.service";
import {PointTuple} from "leaflet";

export interface Objective {
  id: string;
  name: string;
  sector_id: number;
  type: string;
  map_type: string;
  map_id: number;
  upgrade_id: number;
  coord: PointTuple;
  label_coord: PointTuple;
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
  objectives: FullMatchObjective[]
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

export interface FullMatchObjective extends MatchObjective, Objective {}

const staticWorldNames: WorldDictionary = {
  "12001": { id: "12001", name: "Skrittsburgh", population: "N/A" },
  "2001": { id: "2001", name: "Skrittsburgh", population: "N/A" },
  "12002": { id: "12002", name: "Fotune's Vale", population: "N/A" },
  "2002": { id: "2002", name: "Fotune's Vale", population: "N/A" },
  "12003": { id: "12003", name: "Silent Woods", population: "N/A" },
  "2003": { id: "2003", name: "Silent Woods", population: "N/A" },
  "12004": { id: "12004", name: "Ettin's Back", population: "N/A" },
  "2004": { id: "2004", name: "Ettin's Back", population: "N/A" },
  "12005": { id: "12005", name: "Domain of Anguish", population: "N/A" },
  "2005": { id: "2005", name: "Domain of Anguish", population: "N/A" },
  "12006": { id: "12006", name: "Palawadan", population: "N/A" },
  "2006": { id: "2006", name: "Palawadan", population: "N/A" },
  "12007": { id: "12007", name: "Bloodstone Gulch", population: "N/A" },
  "2007": { id: "2007", name: "Bloodstone Gulch", population: "N/A" },
  "12008": { id: "12008", name: "Frost Citadel", population: "N/A" },
  "2008": { id: "2008", name: "Frost Citadel", population: "N/A" },
  "12009": { id: "12009", name: "Dragrimmar", population: "N/A" },
  "2009": { id: "2009", name: "Dragrimmar", population: "N/A" },
  "12010": { id: "12010", name: "Grenth's Door", population: "N/A" },
  "2010": { id: "2010", name: "Grenth's Door", population: "N/A" },
  "12011": { id: "12011", name: "Mirror of Lyssa", population: "N/A" },
  "2011": { id: "2011", name: "Mirror of Lyssa", population: "N/A" },
  "12012": { id: "12012", name: "Melandru's Dome", population: "N/A" },
  "2012": { id: "2012", name: "Melandru's Dome", population: "N/A" },
  "12013": { id: "12013", name: "Kormir's Library", population: "N/A" },
  "2013": { id: "2013", name: "Kormir's Library", population: "N/A" },
  "12014": { id: "12014", name: "Great House Aviary", population: "N/A" },
  "2014": { id: "2014", name: "Great House Aviary", population: "N/A" },
  "12015": { id: "12015", name: "Bava Nisos", population: "N/A" },
  "2101": { id: "2101", name: "Bava Nisos", population: "N/A" },
  "12016": { id: "12016", name: "Temple of Febe", population: "N/A" },
  "2102": { id: "2102", name: "Temple of Febe", population: "N/A" },
  "12017": { id: "12017", name: "Gyala Hatchery", population: "N/A" },
  "2103": { id: "2103", name: "Gyala Hatchery", population: "N/A" },
  "12018": { id: "12018", name: "Grekvelnn Burrows", population: "N/A" },
  "2104": { id: "2104", name: "Grekvelnn Burrows", population: "N/A" },
  "11001": { id: "11001", name: "Moogooloo", population: "N/A" },
  "1001": { id: "1001", name: "Moogooloo", population: "N/A" },
  "11002": { id: "11002", name: "Rall's Rest", population: "N/A" },
  "1002": { id: "1002", name: "Rall's Rest", population: "N/A" },
  "11003": { id: "11003", name: "Domain of Torment", population: "N/A" },
  "1003": { id: "1003", name: "Domain of Torment", population: "N/A" },
  "11004": { id: "11004", name: "Yohlon Haven", population: "N/A" },
  "1004": { id: "1004", name: "Yohlon Haven", population: "N/A" },
  "11005": { id: "11005", name: "Tombs of Drascir", population: "N/A" },
  "1005": { id: "1005", name: "Tombs of Drascir", population: "N/A" },
  "11006": { id: "11006", name: "Hall of Judgment", population: "N/A" },
  "1006": { id: "1006", name: "Hall of Judgment", population: "N/A" },
  "11007": { id: "11007", name: "Throne of Balthazar", population: "N/A" },
  "1007": { id: "1007", name: "Throne of Balthazar", population: "N/A" },
  "11008": { id: "11008", name: "Dwayna's Temple", population: "N/A" },
  "1008": { id: "1008", name: "Dwayna's Temple", population: "N/A" },
  "11009": { id: "11009", name: "Abbaddon's Prison", population: "N/A" },
  "1009": { id: "1009", name: "Abbaddon's Prison", population: "N/A" },
  "11010": { id: "11010", name: "Ruined Cathedral of Blood", population: "N/A" },
  "1010": { id: "1010", name: "Ruined Cathedral of Blood", population: "N/A" },
  "11011": { id: "11011", name: "Lutgardis Conservatory", population: "N/A" },
  "1011": { id: "1011", name: "Lutgardis Conservatory", population: "N/A" },
  "11012": { id: "11012", name: "Mosswood", population: "N/A" },
  "1012": { id: "1012", name: "Mosswood", population: "N/A" },
  "11013": { id: "11013", name: "Mithric Cliffs", population: "N/A" },
  "1013": { id: "1013", name: "Mithric Cliffs", population: "N/A" },
  "11014": { id: "11014", name: "Lagula's Kraal", population: "N/A" },
  "1014": { id: "1014", name: "Lagula's Kraal", population: "N/A" },
  "11015": { id: "11015", name: "De Molish Post", population: "N/A" },
  "1015": { id: "1015", name: "De Molish Post", population: "N/A" },
  "1016": { id: "1016", name: "Sea of Sorrows", population: "VeryHigh" },
  "1017": { id: "1017", name: "Tarnished Coast", population: "VeryHigh" },
  "1018": { id: "1018", name: "Northern Shiverpeaks", population: "Medium" },
  "1019": { id: "1019", name: "Blackgate", population: "Full" },
  "1020": { id: "1020", name: "Ferguson's Crossing", population: "Medium" },
  "1021": { id: "1021", name: "Dragonbrand", population: "High" },
  "1022": { id: "1022", name: "Kaineng", population: "Medium" },
  "1023": { id: "1023", name: "Devona's Rest", population: "VeryHigh" },
  "1024": { id: "1024", name: "Eredon Terrace", population: "High" },
  "2105": { id: "2105", name: "Arborstone [FR]", population: "Medium" },
  "2201": { id: "2201", name: "Kodash [DE]", population: "Medium" },
  "2202": { id: "2202", name: "Riverside [DE]", population: "VeryHigh" },
  "2203": { id: "2203", name: "Elona Reach [DE]", population: "Medium" },
  "2204": { id: "2204", name: "Abaddon's Mouth [DE]", population: "Medium" },
  "2205": { id: "2205", name: "Drakkar Lake [DE]", population: "VeryHigh" },
  "2206": { id: "2206", name: "Miller's Sound [DE]", population: "Medium" },
  "2207": { id: "2207", name: "Dzagonur [DE]", population: "Medium" },
  "2301": { id: "2301", name: "Baruch Bay [SP]", population: "VeryHigh" }
};

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
    const worldNames = of(staticWorldNames);

    return forkJoin([worldNames]).pipe(
      map(src => {
        const names = src[0]
        const mapNames = (ids: string[]) => [...new Set(ids.map(id => {
          if (id in names) {
            return names[id].name;
          }
          return "Unknown"
        }))];


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
        match.objectives = matchObj.reduce((res: FullMatchObjective[], matchObj) => {
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

  getMatchOverviewByWorldId(worldId: string): Observable<MatchOverview> {
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
