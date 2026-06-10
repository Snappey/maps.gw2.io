import {CUSTOM_ELEMENTS_SCHEMA, NgModule} from "@angular/core";
import {CommonModule, NgOptimizedImage} from "@angular/common";
import {FormsModule, ReactiveFormsModule} from "@angular/forms";
import {LetDirective} from "@ngrx/component";
import {ButtonModule} from "primeng/button";
import {CardModule} from "primeng/card";
import {ChartModule} from "primeng/chart";
import {DialogModule} from "primeng/dialog";
import {DividerModule} from "primeng/divider";
import {InputTextModule} from "primeng/inputtext";
import {PanelModule} from "primeng/panel";
import {PasswordModule} from "primeng/password";
import {ProgressSpinnerModule} from "primeng/progressspinner";
import {SelectModule} from "primeng/select";
import {SelectButtonModule} from "primeng/selectbutton";
import {SkeletonModule} from "primeng/skeleton";
import {StyleClassModule} from "primeng/styleclass";
import {ToggleButtonModule} from "primeng/togglebutton";
import {TooltipModule} from "primeng/tooltip";

import {ArraySortPipe} from "../pipes/orderBy.pipe";
import {AboutModalComponent} from "./about-modal/about-modal.component";
import {EditorModalComponent} from "./editor-modal/editor-modal.component";
import {EventGridComponent} from "./event-grid/event-grid.component";
import {EventPanelComponent} from "./event-panel/event-panel.component";
import {LiveMarkerSidebarComponent} from "./live-marker-sidebar/live-marker-sidebar.component";
import {FightStatsChartComponent} from "./mists-chrome/fight-stats-chart/fight-stats-chart.component";
import {MatchOverviewComponent} from "./mists-chrome/match-overview/match-overview.component";
import {ObjectiveDetailsComponent} from "./mists-chrome/objective-details/objective-details.component";
import {ObjectiveTooltipComponent} from "./mists-chrome/objective-tooltip/objective-tooltip.component";
import {ScoreOverviewComponent} from "./mists-chrome/score-overview/score-overview.component";
import {SkirmishStatsChartComponent} from "./mists-chrome/skirmish-stats-chart/skirmish-stats-chart.component";
import {SettingsModalComponent} from "./settings-modal/settings-modal.component";
import {ToolbarComponent} from "./toolbar/toolbar.component";
import {WizardVaultGridComponent} from "./wizard-vault-grid/wizard-vault-grid.component";
import {WizardVaultObjectiveComponent} from "./wizard-vault-objective/wizard-vault-objective.component";

const CHROME_COMPONENTS = [
  ArraySortPipe,
  AboutModalComponent,
  EditorModalComponent,
  EventGridComponent,
  EventPanelComponent,
  LiveMarkerSidebarComponent,
  FightStatsChartComponent,
  MatchOverviewComponent,
  ObjectiveDetailsComponent,
  ObjectiveTooltipComponent,
  ScoreOverviewComponent,
  SkirmishStatsChartComponent,
  SettingsModalComponent,
  ToolbarComponent,
  WizardVaultGridComponent,
  WizardVaultObjectiveComponent,
];

/**
 * Page chrome shared by the map pages — declared here (most components
 * predate standalone) and exported so the standalone OL map components can
 * import the lot with one module.
 */
@NgModule({
  declarations: CHROME_COMPONENTS,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NgOptimizedImage,
    LetDirective,
    ButtonModule,
    CardModule,
    ChartModule,
    DialogModule,
    DividerModule,
    InputTextModule,
    PanelModule,
    PasswordModule,
    ProgressSpinnerModule,
    SelectModule,
    SelectButtonModule,
    SkeletonModule,
    StyleClassModule,
    ToggleButtonModule,
    TooltipModule,
  ],
  exports: CHROME_COMPONENTS,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ChromeModule {
}
