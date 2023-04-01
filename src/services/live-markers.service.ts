import {Injectable} from '@angular/core';
import {IMqttMessage, IMqttServiceOptions, MqttConnectionState, MqttService} from "ngx-mqtt";
import {environment} from '../environments/environment';
import {FeatureGroup, LatLngBounds, Layer, LayerGroup, Map, Point} from 'leaflet';
import {
  catchError, combineLatestWith,
  filter, interval,
  map, merge,
  Observable, skip, Subject,
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
  selectUserWithAuthToken, CharacterStateUpdate, selectLiveMapEnabled
} from "../state/live-markers/live-markers.feature";
import {LiveMarker} from "../lib/live-marker";
import {selectUserAccountName} from "../state/user/user.feature";
import {LabelService} from "./label.service";
import {ToastrService} from "ngx-toastr";

@Injectable({
  providedIn: 'root'
})
export class LiveMarkersService {
  private markers: { [accountId: string]: LiveMarker } = {};

  onConnected$: Observable<boolean> = this.mqttService.state.pipe(
    map(state => state === MqttConnectionState.CONNECTED),
    filter(state => state)
  );

  onDisconnected$: Observable<boolean> = this.mqttService.state.pipe(
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

  private activeMapLayer: Subject<[Map, FeatureGroup]> = new Subject<[Map, FeatureGroup]>();
  activeMapLayer$: Observable<[Map, FeatureGroup]> = this.activeMapLayer.asObservable();

  constructor(private mqttService: MqttService, private http: HttpClient, private store: Store<AppState>, private labelService: LabelService, private toastr: ToastrService) {
    // Update AuthToken when a user changes their API Key
    store.select(s => s.settings.liveMapEnabled).pipe(
      withLatestFrom(this.store.select(s => s.settings.apiKey)),
      filter(([enabled, _]) => enabled),
      map(([_, apiKey]) => apiKey ? apiKey : "buff_reaper"),
      switchMap((apiKey) => this.getAuthToken(apiKey))
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
      filter(([_, state]) => state === MqttConnectionState.CONNECTED)
    ).subscribe(_ => this.mqttService.disconnect(true));

    // Notify connections
    this.mqttService.state.pipe(
      skip(1),
    ).subscribe(state => this.toastr.info(MqttConnectionState[state].toString(), "Live Markers", {
      toastClass: "custom-toastr",
      positionClass: "toast-bottom-left"
    }));

    // Update Player Data Store from Broker
    this.onConnected$.pipe(
      switchMap(_ => this.subscribeToChannel()),
      combineLatestWith(this.activeMapLayer$, this.store.select(selectUserAccountName)),
    ).subscribe(([message, [map, layer], userAccount]) => {
      const data = JSON.parse(message.payload.toString()) as { Type: string };
      const accountName = message.topic.split("/").pop()
      if (!accountName) {
        console.warn("failed to parse incoming message, missing account name: " + message.topic);
        return;
      }

      switch (data.Type) {
        case "UpsertCharacterMovement":
          const msg = { ...data as CharacterPositionUpdate, AccountName: accountName };
          if (accountName in this.markers) {
            if (map.getBounds().contains(map.unproject(new Point(msg.MapPosition.X, msg.MapPosition.Y), map.getMaxZoom()))) {
              return this.markers[accountName].updatePosition(msg)
            }
            return;
          }
          return this.markers[accountName] = new LiveMarker(
            map,
            layer,
            this.store,
            this.labelService,
            msg,
            accountName === userAccount)
        case "UpdateCharacterState":
          return this.markers[accountName].updateState({ ...data as CharacterStateUpdate, AccountName: accountName })
        case "DeleteCharacterData":
          this.markers[accountName].remove();
          return delete this.markers[accountName];
        case "UpdateCharacterKeepAlive":
          return this.markers[accountName].updateLastUpdate()
        default:
          console.warn("received unimplemented packet type from " + accountName + ": " + data.Type);
      }
    });

    interval(30000).subscribe(_ => {
      for (let markersKey in this.markers) {
        this.markers[markersKey].checkExpiry()
      }
    })
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
      tap(topic => console.log("subscribed to " + topic)),
      switchMap(topic => this.mqttService.observe(topic!, { qos: 0 }))
    )
  }

  setActiveMapLayer(map: Map, layer: FeatureGroup) {
    this.activeMapLayer.next([map, layer]);
  }
}
