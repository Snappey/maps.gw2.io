import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { LeafletModule } from '@asymmetrik/ngx-leaflet'
import {DialogModule} from 'primeng/dialog';
import {DynamicDialogModule} from 'primeng/dynamicdialog';


import { TyriaMapComponent } from './tyria-map/tyria-map.component';
import {BrowserAnimationsModule} from "@angular/platform-browser/animations";
import {ToastrModule} from "ngx-toastr";
import {HttpClientModule} from "@angular/common/http";
import {ClipboardModule} from "ngx-clipboard";
import { EditorModalComponent } from './tyria-map/editor-modal/editor-modal.component';
import {DropdownModule} from "primeng/dropdown";
import {FormsModule} from "@angular/forms";
import {ButtonModule} from "primeng/button";
import {SidebarModule} from "primeng/sidebar";
import {CardModule} from "primeng/card";
import { EventPanelComponent } from './tyria-map/event-panel/event-panel.component';
import { EventGridComponent } from './tyria-map/event-grid/event-grid.component';
import {InputTextModule} from "primeng/inputtext";
import {TooltipModule} from "primeng/tooltip";
import {OverlayPanelModule} from "primeng/overlaypanel";
import {PanelModule} from "primeng/panel";
import {DividerModule} from "primeng/divider";
import {StyleClassModule} from "primeng/styleclass";
import { SearchBarComponent } from './tyria-map/search-bar/search-bar.component';
import { DailyPanelComponent } from './tyria-map/daily-panel/daily-panel.component';
import { DailyGridComponent } from './tyria-map/daily-grid/daily-grid.component';
import { MistsMapComponent } from './mists-map/mists-map.component';
import {ArraySortPipe} from "../pipes/orderBy.pipe";
import {SpinnerModule} from "primeng/spinner";
import {ProgressSpinnerModule} from "primeng/progressspinner";
import {CookieModule} from "ngx-cookie";
import {NgAnimatedCounterModule} from "@bugsplat/ng-animated-counter";
import {ChartModule} from "primeng/chart";
import { ObjectiveTooltipComponent } from './mists-map/objective-tooltip/objective-tooltip.component';
import { HomeComponent } from './home/home.component';

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
    HomeComponent
  ],
  imports: [
    BrowserModule,
    LeafletModule,
    BrowserAnimationsModule,
    ToastrModule.forRoot(),
    CookieModule.withOptions(),
    HttpClientModule,
    ClipboardModule,
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
    NgAnimatedCounterModule,
    ChartModule
  ],
  providers: [],
  bootstrap: [HomeComponent]
})
export class AppModule { }
