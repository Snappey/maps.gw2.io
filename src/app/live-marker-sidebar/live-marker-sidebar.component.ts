import {Component, inject, Input} from '@angular/core';
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {LiveMarkersService} from "../../services/live-markers.service";
import {SidebarLiveMarker} from "../../lib/live-marker-types";
import {map, Observable, of, scan, share, Subject, switchMap} from "rxjs";
import {Store} from "@ngrx/store";
import {AppState} from "../../state/appState";
import { NgStyle, NgClass, NgOptimizedImage, AsyncPipe, TitleCasePipe } from '@angular/common';

@Component({
    selector: 'app-live-marker-sidebar',
    templateUrl: './live-marker-sidebar.component.html',
    styleUrls: ['./live-marker-sidebar.component.css'],
    imports: [NgStyle, NgClass, NgOptimizedImage, AsyncPipe, TitleCasePipe]
})
export class LiveMarkerSidebarComponent {
  private liveMarkerService = inject(LiveMarkersService);
  private store = inject<Store<AppState>>(Store);

  /** Marker list from the hosting map's live-marker controller. */
  @Input() set markers(value: Observable<SidebarLiveMarker[]> | undefined) {
    this.activeMarkers$ = value ?? of([]);
  }
  activeMarkers$: Observable<SidebarLiveMarker[]> = of([]);

  clickedMarker$ = new Subject<SidebarLiveMarker | undefined>();

  isFollowing$ = this.clickedMarker$.pipe(
    takeUntilDestroyed(),
    scan((current: SidebarLiveMarker | undefined, clicked) =>
      current !== clicked ? clicked : undefined, undefined),
    share()
  );

  followMarker$ = this.isFollowing$.pipe(
    takeUntilDestroyed(),
    switchMap(marker => marker ? marker.follow(false) : of(null))
  ).subscribe();

  liveMapState$ = this.liveMarkerService.stateChange.pipe(
    map(s => this.liveMarkerService.toFriendlyState(s))
  );

  isEnabled$ = this.store.select(s => s.settings.liveMapEnabled);
  channelDetails$ = this.store.select(s => s.settings).pipe(
    map(s => [s.selectedChannel, s.guildChannel ?? s.customChannel]) // TODO: Convert to selector
  );
}
