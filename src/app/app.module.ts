import {CUSTOM_ELEMENTS_SCHEMA, NgModule} from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {BrowserModule} from '@angular/platform-browser';
import {LeafletModule} from '@asymmetrik/ngx-leaflet'
import {DialogModule} from 'primeng/dialog';
import {DynamicDialogModule} from 'primeng/dynamicdialog';


import {TyriaMapComponent} from './tyria-map/tyria-map.component';
import {BrowserAnimationsModule} from "@angular/platform-browser/animations";
import {ToastrModule} from "ngx-toastr";
import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import {ClipboardModule} from "ngx-clipboard";
import {EditorModalComponent} from './tyria-map/editor-modal/editor-modal.component';
import {SelectModule} from "primeng/select";
import {providePrimeNG} from "primeng/config";
import Lara from "@primeuix/themes/lara";
import {ButtonModule} from "primeng/button";
import {CardModule} from "primeng/card";
import {EventPanelComponent} from './tyria-map/event-panel/event-panel.component';
import {EventGridComponent} from './tyria-map/event-grid/event-grid.component';
import {InputTextModule} from "primeng/inputtext";
import {TooltipModule} from "primeng/tooltip";
import {PanelModule} from "primeng/panel";
import {DividerModule} from "primeng/divider";
import {StyleClassModule} from "primeng/styleclass";
import {MistsMapComponent} from './mists-map/mists-map.component';
import {ArraySortPipe} from "../pipes/orderBy.pipe";
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
import {StoreModule} from "@ngrx/store";
import {mistsFeature} from "../state/mists/mists.feature";
import {EffectsModule} from "@ngrx/effects";
import {MistsEffects} from "../state/mists/mists.effects";
import {StoreDevtoolsModule} from "@ngrx/store-devtools";
import {guildFeature} from "../state/guild/guild.feature";
import {GuildEffects} from "../state/guild/guild.effects";
import {RouterModule} from "@angular/router";
import {IMqttServiceOptions, MqttModule} from "ngx-mqtt";
import {SettingsModalComponent} from './settings-modal/settings-modal.component';
import {settingsFeature} from "../state/settings/settings.feature";
import {liveMarkersFeature} from "../state/live-markers/live-markers.feature";
import {LiveMarkersEffects} from "../state/live-markers/live-markers.effects";
import {SettingsEffects} from "../state/settings/settings.effects";
import {PasswordModule} from "primeng/password";
import {userFeature} from "../state/user/user.feature";
import {UserEffects} from "../state/user/user.effects";
import {LetDirective} from '@ngrx/component';
import {ToggleButtonModule} from "primeng/togglebutton";
import {SelectButtonModule} from "primeng/selectbutton";
import {NgcCookieConsentModule} from "ngx-cookieconsent";
import {LiveMarkerSidebarComponent} from './live-marker-sidebar/live-marker-sidebar.component';
import {AboutModalComponent} from "./about-modal/about-modal.component";
import {NgxGoogleAnalyticsModule, NgxGoogleAnalyticsRouterModule} from "ngx-google-analytics";
import {ToolbarComponent} from './toolbar/toolbar.component';
import {NgOptimizedImage} from "@angular/common";
import {LayerOptionsComponent} from './layer-options/layer-options.component';
import { WizardVaultGridComponent } from './wizard-vault-grid/wizard-vault-grid.component';
import { WizardVaultObjectiveComponent } from './wizard-vault-objective/wizard-vault-objective.component';

export const MQTT_SERVICE_OPTIONS: IMqttServiceOptions = {
  connectOnCreate: false,
};

@NgModule({ declarations: [
        TyriaMapComponent,
        EditorModalComponent,
        EventPanelComponent,
        EventGridComponent,
        MistsMapComponent,
        ArraySortPipe,
        ObjectiveTooltipComponent,
        HomeComponent,
        ScoreOverviewComponent,
        FightStatsChartComponent,
        SkirmishStatsChartComponent,
        MatchOverviewComponent,
        ObjectiveDetailsComponent,
        SettingsModalComponent,
        LiveMarkerSidebarComponent,
        AboutModalComponent,
        ToolbarComponent,
        WizardVaultGridComponent,
        WizardVaultObjectiveComponent
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    bootstrap: [HomeComponent], imports: [BrowserModule,
        LeafletModule,
        BrowserAnimationsModule,
        ToastrModule.forRoot(),
        CookieModule.withOptions(),
        ClipboardModule,
        ReactiveFormsModule,
        MqttModule.forRoot(MQTT_SERVICE_OPTIONS),
        NgcCookieConsentModule.forRoot({
            cookie: {
                domain: 'maps.gw2.io'
            },
            palette: {
                popup: {
                    background: '#000'
                },
                button: {
                    background: '#f1d600'
                }
            },
            theme: 'edgeless',
            position: "bottom",
            type: 'info'
        }),
        DialogModule,
        DynamicDialogModule,
        SelectModule,
        FormsModule,
        ButtonModule,
        CardModule,
        InputTextModule,
        TooltipModule,
        PanelModule,
        DividerModule,
        StyleClassModule,
        ProgressSpinnerModule,
        ChartModule,
        SkeletonModule,
        LayerOptionsComponent,
        RouterModule.forRoot([
            { path: "tyria", component: TyriaMapComponent },
            { path: "tyria/:chatLink", component: TyriaMapComponent },
            { path: "tyria-next", loadComponent: () => import("./tyria-ol-map/tyria-ol-map.component").then(c => c.TyriaOlMapComponent) },
            { path: "tyria-next/:chatLink", loadComponent: () => import("./tyria-ol-map/tyria-ol-map.component").then(c => c.TyriaOlMapComponent) },
            { path: "wvw-next", loadComponent: () => import("./mists-ol-map/mists-ol-map.component").then(c => c.MistsOlMapComponent) },
            { path: "wvw-next/:id", loadComponent: () => import("./mists-ol-map/mists-ol-map.component").then(c => c.MistsOlMapComponent) },
            { path: "wvw-next/:id/:chatLink", loadComponent: () => import("./mists-ol-map/mists-ol-map.component").then(c => c.MistsOlMapComponent) },
            { path: "wvw", component: MistsMapComponent },
            { path: "wvw/:id", component: MistsMapComponent },
            { path: "wvw/:id/:chatLink", component: MistsMapComponent },
            { path: ":chatLink", redirectTo: "/tyria/:chatLink", pathMatch: "full" },
            { path: "**", redirectTo: "/tyria", pathMatch: "full" }
        ]),
        LetDirective,
        StoreModule.forRoot(),
        StoreModule.forFeature(settingsFeature),
        StoreModule.forFeature(userFeature),
        StoreModule.forFeature(mistsFeature),
        StoreModule.forFeature(guildFeature),
        StoreModule.forFeature(liveMarkersFeature),
        EffectsModule.forRoot([
            SettingsEffects,
            UserEffects,
            MistsEffects,
            GuildEffects,
            LiveMarkersEffects
        ]),
        StoreDevtoolsModule.instrument({
            maxAge: 25,
            logOnly: false,
            connectInZone: true
        }),
        PasswordModule,
        ToggleButtonModule,
        SelectButtonModule,
        NgxGoogleAnalyticsModule.forRoot('G-ZF8RV8P3LT'),
        NgxGoogleAnalyticsRouterModule,
        NgOptimizedImage], providers: [
        provideHttpClient(withInterceptorsFromDi()),
        providePrimeNG({
            theme: {
                preset: Lara,
                options: {
                    darkModeSelector: false
                }
            }
        })
    ] })
export class AppModule {
}
