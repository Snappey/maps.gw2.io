import {Injectable} from '@angular/core';
import {IMqttMessage, IMqttServiceOptions, MqttConnectionState, MqttService} from "ngx-mqtt";
import {environment} from '../environments/environment';
import {FeatureGroup, Layer, LayerGroup, Map} from 'leaflet';
import {
  catchError, combineLatestWith,
  filter,
  map,
  Observable, Subject,
  switchMap, tap,
  withLatestFrom
} from "rxjs";
import {HttpClient} from "@angular/common/http";
import {AppState} from "../state/appState";
import {Store} from "@ngrx/store";
import {liveMarkersActions} from "../state/live-markers/live-markers.action";
import {
  LivePlayerData,
  CharacterDeleteUpdate,
  CharacterPositionUpdate,
  selectUserTopic,
  selectUserWithAuthToken, CharacterStateUpdate
} from "../state/live-markers/live-markers.feature";

@Injectable({
  providedIn: 'root'
})
export class LiveMarkersService {
  onConnected$: Observable<boolean> = this.mqttService.state.pipe(
    tap(state => console.log(state)),
    map(state => state === MqttConnectionState.CONNECTED),
    filter(state => state)
  );

  onDisconnected$: Observable<boolean> = this.mqttService.state.pipe(
    map(state => state === MqttConnectionState.CLOSED),
    filter(state => !state)
  );

  livePlayerData$: Observable<LivePlayerData[]> =
    this.store.select(s => s.liveMarkers.players).pipe(
      map(p => Object.values(p))
    )

  stateChange: Observable<MqttConnectionState> = this.mqttService.state;
  private mqttOptions: IMqttServiceOptions = {
    hostname: 'post.gw2.io',
    protocol: "wss",
    port: 8084,
    path: '/ws'
  };

  private activeMapLayer: Subject<[Map, FeatureGroup]> = new Subject<[Map, FeatureGroup]>();
  activeMapLayer$: Observable<[Map, FeatureGroup]> = this.activeMapLayer.asObservable();

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

    // Update Player Data Store from Broker
    this.onConnected$.pipe(
      switchMap(_ => this.subscribeToChannel())
    ).subscribe((message) => {
      const data = JSON.parse(message.payload.toString()) as { Type: string };
      const accountName = message.topic.split("/").pop()
      if (!accountName) {
        console.warn("failed to parse incoming message, missing account name: " + message.topic);
        return;
      }
      switch (data.Type) {
        case "UpsertCharacterMovement":
          return this.store.dispatch(liveMarkersActions.upsertPlayerData({ data: { ...data as CharacterPositionUpdate, AccountName: accountName } }));
        case "UpdateCharacterState":
          return this.store.dispatch(liveMarkersActions.updatePlayerState({ data: { ...data as CharacterStateUpdate, AccountName: accountName }  }));
        case "DeleteCharacterData":
          return this.store.dispatch(liveMarkersActions.deletePlayerData({ accountName }));
        case "UpdateCharacterKeepAlive":
          return this.store.dispatch(liveMarkersActions.updatePlayerKeepalive({ accountName }));
        default:
          console.warn("received unimplemented packet type: " + data.Type);
      }
    });
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

  setActiveMapLayer(map: Map, layer: FeatureGroup) {
    this.activeMapLayer.next([map, layer]);
  }
}
