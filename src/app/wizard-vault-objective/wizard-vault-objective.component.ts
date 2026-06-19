import {Component, Input} from '@angular/core';
import {WizardVaultObjective} from "../../services/wizard-vault.service";
import { NgClass } from '@angular/common';

@Component({
    selector: 'app-wizard-vault-objective',
    templateUrl: './wizard-vault-objective.component.html',
    styleUrls: ['./wizard-vault-objective.component.css'],
    imports: [NgClass]
})
export class WizardVaultObjectiveComponent {
  @Input()
  objective!: WizardVaultObjective;
}
