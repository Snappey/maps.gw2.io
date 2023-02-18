import {NgModule, CUSTOM_ELEMENTS_SCHEMA} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {LeafletModule} from '@asymmetrik/ngx-leaflet'
import {DialogModule} from 'primeng/dialog';
import {DynamicDialogModule} from 'primeng/dynamicdialog';


import {TyriaMapComponent} from './tyria-map/tyria-map.component';
import {BrowserAnimationsModule} from "@angular/platform-browser/animations";
import {ToastrModule} from "ngx-toastr";
import {HttpClientModule} from "@angular/common/http";
import {ClipboardModule} from "ngx-clipboard";
import {EditorModalComponent} from './tyria-map/editor-modal/editor-modal.component';
import {DropdownModule} from "primeng/dropdown";
import {FormsModule} from "@angular/forms";
import {ButtonModule} from "primeng/button";
import {SidebarModule} from "primeng/sidebar";
import {CardModule} from "primeng/card";
import {EventPanelComponent} from './tyria-map/event-panel/event-panel.component';
import {EventGridComponent} from './tyria-map/event-grid/event-grid.component';
import {InputTextModule} from "primeng/inputtext";
import {TooltipModule} from "primeng/tooltip";
import {OverlayPanelModule} from "primeng/overlaypanel";
import {PanelModule} from "primeng/panel";
import {DividerModule} from "primeng/divider";
import {StyleClassModule} from "primeng/styleclass";
import {SearchBarComponent} from './tyria-map/search-bar/search-bar.component';
import {DailyPanelComponent} from './tyria-map/daily-panel/daily-panel.component';
import {DailyGridComponent} from './tyria-map/daily-grid/daily-grid.component';
import {MistsMapComponent} from './mists-map/mists-map.component';
import {ArraySortPipe} from "../pipes/orderBy.pipe";
import {SpinnerModule} from "primeng/spinner";
import {ProgressSpinnerModule} from "primeng/progressspinner";
import {CookieModule} from "ngx-cookie";
import {ChartModule} from "primeng/chart";
import {ObjectiveTooltipComponent} from './mists-map/objective-tooltip/objective-tooltip.component';
import {HomeComponent} from './home/home.component';
import {ScoreOverviewComponent} from './mists-map/score-overview/score-overview.component';
import {FightStatsChartComponent} from './mists-map/fight-stats-chart/fight-stats-chart.component';
import {SkirmishStatsChartComponent} from './mists-map/skirmish-stats-chart/skirmish-stats-chart.component';
import {MatchOverviewComponent} from './mists-map/match-overview/match-overview.component';
import {ObjectiveDetailsComponent} from './mists-map/objective-details/objective-details.component';
import {SkeletonModule} from "primeng/skeleton";
import {TabMenuModule} from "primeng/tabmenu";
import {RouterTestingModule} from "@angular/router/testing";
import {StoreModule} from "@ngrx/store";
import {mistsFeature} from "../state/mists/mists.feature";
import {EffectsModule} from "@ngrx/effects";
import {MistsEffects} from "../state/mists/mists.effects";
import {StoreDevtoolsModule} from "@ngrx/store-devtools";
import {guildFeature} from "../state/guild/guild.feature";
import {GuildEffects} from "../state/guild/guild.effects";
import {RouterModule} from "@angular/router";
import {IMqttServiceOptions, MqttModule} from "ngx-mqtt";

export const MQTT_SERVICE_OPTIONS: IMqttServiceOptions = {
  hostname: 'post.gw2.io',
  protocol: "wss",
  port: 8083,
  path: '/ws'
};

@NgModule({
  declarations: [
    TyriaMapComponent,
    EditorModalComponent,
    EventPanelComponent,
    EventGridComponent,
    SearchBarComponent,
    DailyPanelComponent,
    DailyGridComponent,
    MistsMapComponent,
    ArraySortPipe,
    ObjectiveTooltipComponent,
    HomeComponent,
    ScoreOverviewComponent,
    FightStatsChartComponent,
    SkirmishStatsChartComponent,
    MatchOverviewComponent,
    ObjectiveDetailsComponent,
  ],
  imports: [
    BrowserModule,
    LeafletModule,
    BrowserAnimationsModule,
    ToastrModule.forRoot(),
    CookieModule.withOptions(),
    HttpClientModule,
    ClipboardModule,

    MqttModule.forRoot(MQTT_SERVICE_OPTIONS),

    DialogModule,
    DynamicDialogModule,
    DropdownModule,
    FormsModule,
    ButtonModule,
    SidebarModule,
    CardModule,
    InputTextModule,
    TooltipModule,
    OverlayPanelModule,
    PanelModule,
    DividerModule,
    StyleClassModule,
    SpinnerModule,
    ProgressSpinnerModule,
    ChartModule,
    SkeletonModule,
    TabMenuModule,
    RouterTestingModule,
    RouterModule.forRoot([
      { path: "tyria", component: TyriaMapComponent },
      { path: "wvw", component: MistsMapComponent },
      { path: "wvw/:id", component: MistsMapComponent },
      { path: "**", redirectTo: "/tyria", pathMatch: "full" }
    ]),


    StoreModule.forRoot(),
    StoreModule.forFeature(mistsFeature),
    StoreModule.forFeature(guildFeature),
    EffectsModule.forRoot([
      MistsEffects,
      GuildEffects
    ]),

    StoreDevtoolsModule.instrument({
      maxAge: 25,
      logOnly: false,
    }),
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  providers: [],
  bootstrap: [HomeComponent],
})
export class AppModule {
}
