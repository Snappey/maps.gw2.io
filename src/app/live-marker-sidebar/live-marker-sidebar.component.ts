import {ChangeDetectionStrategy, Component, OnDestroy} from '@angular/core';
import {LiveMarkersService} from "../../services/live-markers.service";
import {LiveMarker} from "../../lib/live-marker";
import {map, of, scan, share, Subject, switchMap, takeUntil, tap} from "rxjs";
import {MqttConnectionState} from "ngx-mqtt";
import {LiveMarkersState} from "../../state/live-markers/live-markers.feature";
import {Store} from "@ngrx/store";
import {SettingsState} from "../../state/settings/settings.feature";
import {AppState} from "../../state/appState";

@Component({
  selector: 'app-live-marker-sidebar',
  templateUrl: './live-marker-sidebar.component.html',
  styleUrls: ['./live-marker-sidebar.component.css']
})
export class LiveMarkerSidebarComponent implements OnDestroy {
  onDestroy$: Subject<void> = new Subject<void>();
  activeMarkers$ = this.liveMarkerService.activeMarkers$;
  clickedMarker$: Subject<LiveMarker | undefined> = new Subject<LiveMarker | undefined>();

  isFollowing$ = this.clickedMarker$.pipe(
    takeUntil(this.onDestroy$),
    scan((current: LiveMarker | undefined, clicked) =>
      current !== clicked ? clicked : undefined, undefined),
    share()
  );

  followMarker$ = this.isFollowing$.pipe(
    takeUntil(this.onDestroy$),
    switchMap(marker =>
      !!marker ?
        marker.follow(false) :
        of(null)
    )
  ).subscribe();

  liveMapState$ = this.liveMarkerService.stateChange.pipe(
    map(s => {
      switch (s) {
        case MqttConnectionState.CONNECTED:
          return "connected";
        case MqttConnectionState.CONNECTING:
          return "connecting";
        case MqttConnectionState.CLOSED:
          return "disconnected";
        default:
          return "unknown";
      }
    })
  )

  isEnabled$ = this.store.select(s => s.settings.liveMapEnabled);
  channelDetails$ = this.store.select(s => s.settings).pipe(
    map(s => [s.selectedChannel, s.guildChannel ?? s.customChannel]) // TODO: Convert to selector
  )

  constructor(private liveMarkerService: LiveMarkersService, private store: Store<AppState>) {
  }

  ngOnDestroy() {
    this.onDestroy$.next();
    this.onDestroy$.complete();
  }
}
