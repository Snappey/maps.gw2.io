import {Injectable} from '@angular/core';
import {IMqttMessage, IMqttServiceOptions, MqttConnectionState, MqttService} from "ngx-mqtt";
import {environment} from '../environments/environment';
import {
  bufferToggle,
  catchError, combineLatestWith,
  concatMap,
  filter,
  map,
  merge, mergeMap,
  Observable, skipUntil, Subject,
  switchMap, takeUntil, tap,
  windowToggle,
  withLatestFrom
} from "rxjs";
import {HttpClient} from "@angular/common/http";
import {AppState} from "../state/appState";
import {Store} from "@ngrx/store";
import {liveMarkersActions} from "../state/live-markers/live-markers.action";
import {selectUserTopic, selectUserWithAuthToken} from "../state/live-markers/live-markers.feature";

@Injectable({
  providedIn: 'root'
})
export class LiveMarkersService {
  onConnected: Observable<boolean> = this.mqttService.state.pipe(
    tap(state => console.log(state)),
    map(state => state === MqttConnectionState.CONNECTED),
    filter(state => state)
  );

  onDisconnected: Observable<boolean> = this.mqttService.state.pipe(
    map(state => state === MqttConnectionState.CLOSED),
    filter(state => !state)
  );

  stateChange: Observable<MqttConnectionState> = this.mqttService.state;
  private mqttOptions: IMqttServiceOptions = {
    hostname: 'post.gw2.io',
    protocol: "wss",
    port: 8084,
    path: '/ws'
  };

  constructor(private mqttService: MqttService, private http: HttpClient, private store: Store<AppState>) {
    // Update AuthToken when a user changes their API Key
    store.select(s => s.settings.liveMapEnabled).pipe(
      withLatestFrom(this.store.select(s => s.settings.apiKey)),
      filter(([_, apiKey]) => !!apiKey),
      switchMap(([_, apiKey]) => this.getAuthToken(apiKey!))
    ).subscribe(authToken => this.store.dispatch(liveMarkersActions.setAuthToken({ authToken })))

    // When a users authToken changes try and connect to the MQTT Broker
    store.select(selectUserWithAuthToken).pipe(
      filter((data) => !!data.authToken && !!data.user),
      withLatestFrom(this.stateChange),
      filter(([_, state]) => state !== MqttConnectionState.CONNECTED),
      map(([data, _]) =>
        this.mqttService.connect({
          ...this.mqttOptions,
          clientId: data.user,
          username: data.user,
          password: data.authToken!
        })
      ),
      catchError( async error => console.log("failed to connect to broker: " + error))
    ).subscribe();
  }

  getAuthToken(apiKey: string, customChannels: string[] = []): Observable<string> {
    return this.http.post(environment.liveMarkers.authUrl, {
      "api_token": apiKey,
      "channels": customChannels
    }, { responseType: 'text'})
  }

  subscribeToChannel(): Observable<IMqttMessage> {
    return this.store.select(selectUserTopic).pipe(
      filter(topic => !!topic),
      tap(topic => console.log("Subscribed to " + topic)),
      switchMap(topic => this.mqttService.observe(topic!, { qos: 0 }))
    )
  }
}
