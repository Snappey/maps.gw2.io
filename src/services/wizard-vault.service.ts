import { Injectable } from '@angular/core';
import {HttpClient} from "@angular/common/http";
import {Observable} from "rxjs";

export interface WizardVaultTrack {
  meta_progress_current: number;
  meta_progress_complete: number;
  meta_reward_item_id: number;
  meta_reward_astral: number;
  meta_reward_claimed: number;
  objectives: WizardVaultObjective[];
}

export interface WizardVaultObjective {
  id: number;
  title: string;
  track: "PvE" | "PvP" | "WvW";
  acclaim: number;
  progress_current: number;
  progress_complete: number;
  claimed: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class WizardVaultService {

  constructor(private httpClient: HttpClient) {
  }

  getDailyTrack(apiKey: string): Observable<WizardVaultTrack> {
    return this.httpClient.get<WizardVaultTrack>("https://api.guildwars2.com/v2/account/wizardsvault/daily?access_token=" + apiKey);
  }

  getWeeklyTrack(apiKey: string): Observable<WizardVaultTrack> {
    return this.httpClient.get<WizardVaultTrack>("https://api.guildwars2.com/v2/account/wizardsvault/weekly?access_token=" + apiKey);
  }

  getSpecialTrack(apiKey: string): Observable<WizardVaultTrack> {
    return this.httpClient.get<WizardVaultTrack>("https://api.guildwars2.com/v2/account/wizardsvault/special?access_token=" + apiKey);
  }
}
