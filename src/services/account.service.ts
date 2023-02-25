import { Injectable } from '@angular/core';
import {HttpClient} from "@angular/common/http";
import {map, Observable} from "rxjs";
import {MapService} from "./map.service";

export interface AccountInfo {
  id: string;
  name: string;
  age: number;
  world: string;
  guilds: string[];
  guild_leader: string[];
  created: Date | undefined;
  access: string[];
  commander: boolean;
  fractal_level: number;
  daily_ap: number;
  monthly_ap: number;
  wvw_rank: number;

}

@Injectable({
  providedIn: 'root'
})
export class AccountService {
  constructor(private http: HttpClient) { }

  getAccountInfo(apiKey: string): Observable<AccountInfo> {
    return this.http.get<AccountInfo>("https://api.guildwars2.com/v2/account?access_token=" + apiKey);
  }
}
