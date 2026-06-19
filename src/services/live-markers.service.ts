import {Injectable} from '@angular/core';
import {IMqttServiceOptions, MqttConnectionState, MqttService} from "ngx-mqtt";
import {environment} from '../environments/environment';
import {BehaviorSubject, filter, map, Observable, share, switchMap} from "rxjs";
import { HttpClient } from "@angular/common/http";
import {MqttPayloadType} from "../lib/live-marker-types";

export interface LiveMarkerMessage {
  accountName: string;
  data: {Type: MqttPayloadType};
}

/**
 * Broker connection primitives + the decoded message stream. Marker rendering
 * lives in the maps (OlLiveMarkersController in src/lib/ol/live-markers-layer.ts);
 * the store-reactive lifecycle lives in LiveMarkersEffects, which drives
 * connect()/disconnect() and pushes the current channel via setTopic(). The
 * service itself stays store-agnostic — it only knows the topic it was told.
 */
// Provided by the map shell route (map-shell.routes.ts), not the root injector:
// it depends on MqttService, which is scoped there to keep mqtt-browser out of
// the initial bundle. Both maps share this one instance via that route scope.
@Injectable()
export class LiveMarkersService {
  /** Current MQTT topic to observe; fed by LiveMarkersEffects from the store. */
  private readonly topic$ = new BehaviorSubject<string | undefined>(undefined);
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

  constructor(private mqttService: MqttService, private http: HttpClient) {}

  /** Set the channel to observe; driven by LiveMarkersEffects from the store. */
  setTopic(topic: string | undefined): void {
    this.topic$.next(topic);
  }

  getAuthToken(apiKey: string, customChannels: string[] = []): Observable<string> {
    return this.http.post(environment.liveMarkers.authUrl, {
      "api_token": apiKey,
      "channels": customChannels
    }, { responseType: 'text'})
  }

  /** Open the broker connection for `user` with a freshly-issued auth token. */
  connect(user: string | undefined, authToken: string): void {
    this.mqttService.connect({
      ...this.mqttOptions,
      clientId: user ? user : "anonymous-" + (Math.random() + 1).toString(36).substring(7),
      username: user ? user : "anonymous",
      password: authToken,
    });
  }

  disconnect(): void {
    this.mqttService.disconnect(true);
  }

  private subscribeToChannel() {
    return this.topic$.pipe(
      filter((topic): topic is string => !!topic),
      switchMap(topic => this.mqttService.observe(topic, { qos: 0 }))
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
