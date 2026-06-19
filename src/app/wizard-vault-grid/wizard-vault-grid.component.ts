import { Component } from '@angular/core';
import {WizardVaultService} from "../../services/wizard-vault.service";
import {Store} from "@ngrx/store";
import {AppState} from "../../state/appState";
import {exhaustMap, filter, tap} from "rxjs";
import { LetDirective } from '@ngrx/component';
import { WizardVaultObjectiveComponent } from '../wizard-vault-objective/wizard-vault-objective.component';
import { AsyncPipe } from '@angular/common';

@Component({
    selector: 'app-wizard-vault-grid',
    templateUrl: './wizard-vault-grid.component.html',
    styleUrls: ['./wizard-vault-grid.component.css'],
    imports: [LetDirective, WizardVaultObjectiveComponent, AsyncPipe]
})
export class WizardVaultGridComponent {

  apiKey$ = this.store.select(s => s.settings.apiKey);

  dailyTrack$ = this.apiKey$.pipe(
    filter(apiKey => !!apiKey),
    exhaustMap(apiKey => this.wizardVaultService.getDailyTrack(apiKey!))
  );

  weeklyTrack$ = this.apiKey$.pipe(
    filter(apiKey => !!apiKey),
    exhaustMap(apiKey => this.wizardVaultService.getWeeklyTrack(apiKey!))
  );

  specialTrack$ = this.apiKey$.pipe(
    filter(apiKey => !!apiKey),
    exhaustMap(apiKey => this.wizardVaultService.getSpecialTrack(apiKey!))
  );

  constructor (private store: Store<AppState>, public wizardVaultService: WizardVaultService) {

  }
}
