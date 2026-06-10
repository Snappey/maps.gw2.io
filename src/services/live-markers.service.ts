import {Injectable} from '@angular/core';
import {IMqttServiceOptions, MqttConnectionState, MqttService} from "ngx-mqtt";
import {environment} from '../environments/environment';
import {filter, map, Observable, share, skip, Subject, switchMap, tap, withLatestFrom} from "rxjs";
import { HttpClient } from "@angular/common/http";
import {AppState} from "../state/appState";
import {Store} from "@ngrx/store";
import {liveMarkersActions} from "../state/live-markers/live-markers.action";
import {
  MqttPayloadType,
  selectLiveMapEnabled,
  selectUserTopic,
  selectUserWithAuthToken
} from "../state/live-markers/live-markers.feature";
import {ToastrService} from "ngx-toastr";

export interface LiveMarkerMessage {
  accountName: string;
  data: {Type: MqttPayloadType};
}

/**
 * Broker connection lifecycle + the decoded message stream. Marker rendering
 * lives in the maps (OlLiveMarkersController in src/lib/ol/live-markers-layer.ts).
 */
@Injectable({
  providedIn: 'root'
})
export class LiveMarkersService {
  onConnected$: Observable<boolean> = this.mqttService.state.pipe(
    map(state => state === MqttConnectionState.CONNECTED),
    filter(state => state)
  );

  stateChange: Observable<MqttConnectionState> = this.mqttService.state;
  private mqttOptions: IMqttServiceOptions = {
    hostname: environment.liveMarkers.brokerUrl,
    protocol: "wss",
    port: 443,
    path: '/mqtt'
  };

  /** Raw decoded broker messages, shared between maps. */
  messages$: Observable<LiveMarkerMessage> = this.onConnected$.pipe(
    switchMap(() => this.subscribeToChannel()),
    map(message => {
      const accountName = message.topic.split("/").pop();
      if (!accountName) {
        console.warn("failed to parse incoming message, missing account name: " + message.topic);
        return undefined;
      }
      return {accountName, data: JSON.parse(message.payload.toString()) as {Type: MqttPayloadType}};
    }),
    filter((msg): msg is LiveMarkerMessage => !!msg),
    share(),
  );

  constructor(private mqttService: MqttService, private http: HttpClient, private store: Store<AppState>, private toastr: ToastrService) {
    // Update AuthToken when a user changes their API Key
    store.select(s => s.settings.liveMapEnabled).pipe(
      withLatestFrom(this.store.select(s => s.settings.apiKey)),
      filter(([enabled, _]) => enabled),
      map(([_, apiKey]) => apiKey ? apiKey : "buff_reaper"),
      switchMap((apiKey) => this.getAuthToken(apiKey)),
    ).subscribe(authToken => this.store.dispatch(liveMarkersActions.setAuthToken({ authToken })))

    // When a users authToken changes try and connect to the MQTT Broker
    store.select(selectUserWithAuthToken).pipe(
      filter((data) => !!data.authToken),
      withLatestFrom(this.stateChange, this.store.select(selectLiveMapEnabled)),
      filter(([_, state, isEnabled]) => isEnabled && state !== MqttConnectionState.CONNECTED),
    ).subscribe(([data, _, __]) => this.mqttService.connect({
      ...this.mqttOptions,
      clientId: data.user ? data.user : "anonymous-" + (Math.random() + 1).toString(36).substring(7),
      username: data.user ? data.user : "anonymous",
      password: data.authToken!
    }));

    // Disconnect from broker if liveMapDisabled
    store.select(s => s.settings.liveMapEnabled).pipe(
      filter(enabled => !enabled),
      withLatestFrom(this.mqttService.state),
      filter(([_, state]) => state === MqttConnectionState.CONNECTED),
    ).subscribe(_ => this.mqttService.disconnect(true));

    // Notify connections
    this.mqttService.state.pipe(
      skip(1),
    ).subscribe(state => this.toastr.info(this.toFriendlyState(state), "Live Markers", {
      toastClass: "custom-toastr",
      positionClass: "toast-bottom-left"
    }));
  }

  getAuthToken(apiKey: string, customChannels: string[] = []): Observable<string> {
    return this.http.post(environment.liveMarkers.authUrl, {
      "api_token": apiKey,
      "channels": customChannels
    }, { responseType: 'text'})
  }

  private subscribeToChannel() {
    return this.store.select(selectUserTopic).pipe(
      filter(topic => !!topic),
      tap(topic => console.log("subscribed to " + topic)),
      switchMap(topic => this.mqttService.observe(topic!, { qos: 0 }))
    )
  }

  toFriendlyState(state: MqttConnectionState): string {
    switch (state) {
      case MqttConnectionState.CONNECTED:
        return "Connected";
      case MqttConnectionState.CONNECTING:
        return "Connecting";
      case MqttConnectionState.CLOSED:
        return "Disconnected";
      default:
        return "Unknown";
    }
  }
}
