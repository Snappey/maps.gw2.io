import {Injectable} from '@angular/core';
import {createEffect} from '@ngrx/effects';
import {Store} from "@ngrx/store";
import {MqttConnectionState} from "ngx-mqtt";
import {filter, map, skip, switchMap, tap, withLatestFrom} from "rxjs";
import {ToastrService} from "ngx-toastr";
import {AppState} from "../appState";
import {LiveMarkersService} from "../../services/live-markers.service";
import {liveMarkersActions} from "./live-markers.action";
import {selectLiveMapEnabled, selectUserTopic, selectUserWithAuthToken} from "./live-markers.feature";
import {TOAST_BOTTOM_LEFT} from "../../lib/toast-options";

/**
 * Store-reactive broker lifecycle. Lives here rather than in the
 * LiveMarkersService constructor; the service now only exposes the
 * connect/disconnect/getAuthToken primitives + message stream these drive.
 */
@Injectable()
export class LiveMarkersEffects {

  /** Re-issue the auth token whenever live map is enabled / the API key changes. */
  updateAuthToken$ = createEffect(() => this.store.select(s => s.settings.liveMapEnabled).pipe(
    withLatestFrom(this.store.select(s => s.settings.apiKey)),
    filter(([enabled]) => enabled),
    map(([, apiKey]) => apiKey ? apiKey : "buff_reaper"),
    switchMap(apiKey => this.liveMarkers.getAuthToken(apiKey)),
    map(authToken => liveMarkersActions.setAuthToken({ authToken })),
  ));

  /** Connect to the broker once an auth token is available and live map is on. */
  connect$ = createEffect(() => this.store.select(selectUserWithAuthToken).pipe(
    filter(data => !!data.authToken),
    withLatestFrom(this.liveMarkers.stateChange, this.store.select(selectLiveMapEnabled)),
    filter(([, state, isEnabled]) => isEnabled && state !== MqttConnectionState.CONNECTED),
    tap(([data]) => this.liveMarkers.connect(data.user, data.authToken!)),
  ), {dispatch: false});

  /** Keep the service's observed channel in sync with the user's selected topic. */
  topic$ = createEffect(() => this.store.select(selectUserTopic).pipe(
    tap(topic => this.liveMarkers.setTopic(topic)),
  ), {dispatch: false});

  /** Disconnect when live map is turned off. */
  disconnect$ = createEffect(() => this.store.select(s => s.settings.liveMapEnabled).pipe(
    filter(enabled => !enabled),
    withLatestFrom(this.liveMarkers.stateChange),
    filter(([, state]) => state === MqttConnectionState.CONNECTED),
    tap(() => this.liveMarkers.disconnect()),
  ), {dispatch: false});

  /** Toast on broker connection state changes. */
  notifyState$ = createEffect(() => this.liveMarkers.stateChange.pipe(
    skip(1),
    tap(state => this.toastr.info(this.liveMarkers.toFriendlyState(state), "Live Markers", TOAST_BOTTOM_LEFT)),
  ), {dispatch: false});

  constructor(
    private store: Store<AppState>,
    private liveMarkers: LiveMarkersService,
    private toastr: ToastrService,
  ) {}
}
