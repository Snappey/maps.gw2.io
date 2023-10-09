import {Injectable} from '@angular/core';
import {HttpClient} from "@angular/common/http";
import {map, mergeAll, Observable} from "rxjs";

export interface Level {
  min: number;
  max: number;
}

export interface DailyAchievement {
  id: number;
  level: Level;
  required_access: string[];
}

export interface Tier {
  count: number;
  points: number;
}

export interface Reward {
  type: string;
  id: number;
  count: number;
}

export interface AchievementDetails {
  id: number;
  name: string;
  description: string;
  requirement: string;
  locked_text: string;
  type: string;
  flags: string[];
  tiers: Tier[];
  rewards: Reward[];

  category?: string;
  min_level?: number;
  max_level?: number;
}

export interface DailyAchievements {
  [type: string]: DailyAchievement[];
}

@Injectable({
  providedIn: 'root'
})
export class DailyService {

  constructor(private http: HttpClient) { }

  getAchievementDetails(id: number): Observable<AchievementDetails> {
    return this.http.get<AchievementDetails>(`https://api.guildwars2.com/v2/achievements/${id}`)
  }

  getDailyAchievements(): Observable<AchievementDetails> {
    return this.http.get<DailyAchievements>("https://api.guildwars2.com/v2/achievements/daily")
      .pipe(
        map(acv => {
          const res = [];
          for (let type in acv) {
            res.push(...acv[type]
              .map(a => this.getAchievementDetails(a.id)
              .pipe(
                map(acv => ({...acv, category: type, min_level: a.level.min, max_level: a.level.max}))
              )
            ))
          }

          return res;
        }),
        mergeAll(),
        mergeAll()
      );
  }
}
