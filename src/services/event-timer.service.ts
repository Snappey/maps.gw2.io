import { Injectable } from '@angular/core';
import {HttpClient} from "@angular/common/http";
import {map, timer, Observable, switchMap, tap, shareReplay, of, from} from "rxjs";
import {LayerGroup, Map, Marker, Point, PointTuple} from "leaflet";
import {LabelService} from "./label.service";
import * as moment from "moment";
import {ClipboardService} from "ngx-clipboard";
import {ToastrService} from "ngx-toastr";
import events from "../assets/data/event_timers.json";

export interface Event {
  timeUntil: number;
  nextEvent: Date;
  name: string;
  chatLink: string;
  portrait: string | undefined;
  coordinates: PointTuple;
  xpac: string;
  map: string;
  times: Date[];
}

export interface EventMap {
  [xpac: string]: Event[]
}

interface NextEvent {
  timeUntil: number;
  time: Date;
}

@Injectable({
  providedIn: 'root'
})
export class EventTimerService {
  private events: Event[];

  constructor(private http: HttpClient, private labelService: LabelService, private clipboard: ClipboardService, private toastr: ToastrService) {
    this.events = events as unknown as Event[]; // TODO: Fix dodgy casting... maybe...?
  }

  getEvents(): Observable<Event[]> {
    return of(this.events)
  }

  private createMarker(leaflet: Map, event: Event): Marker {
    const nextEvent = this.getNextEvent(event.times);
    const icon = "assets/event-boss.png"

    return this.labelService.createCanvasMarker(leaflet, event.coordinates, icon)
      .bindTooltip(`${event.name} - ${Math.round(nextEvent.timeUntil)} Minutes`, { className: "tooltip", offset: new Point(25, 0)} )
      .on("click", (_: any) => {
        this.clipboard.copy(event.chatLink);

        this.toastr.info(`Copied closest waypoint to clipboard!`, "", {
          toastClass: "custom-toastr",
          positionClass: "toast-top-right"
        });
      });
  }

  getAllEventsLayer(leaflet: Map): Observable<LayerGroup> {
    return this.getEvents()
      .pipe(
        map(labels => {
          const markers = new LayerGroup();
          labels.forEach(label => this.createMarker(leaflet, label).addTo(markers))

          return markers;
        })
      );
  }

  getEventsLayer(leaflet: Map, count: number = 5): Observable<LayerGroup> {
    return this.getNextEvents(count)
      .pipe(map(events => this.createEventsLayer(leaflet, events)))
  }

  createEventsLayer(leaflet: Map, events: EventMap): LayerGroup {
    const markers = new LayerGroup();

    for (let key in events) {
      const labels = events[key];
      labels
        .filter(label => label.timeUntil < 30)
        .forEach(label => this.createMarker(leaflet, label).addTo(markers))
    }

    return markers;
  }

  getNextEvents(count: number = 5): Observable<EventMap> {
    return this.getEvents()
      .pipe(
        map(labels => {
        let eventMap: EventMap = {};

        labels.forEach(label => {
          if (!(label.xpac in eventMap))
            eventMap[label.xpac] = [];

          const nextEvent = this.getNextEvent(label.times);
          eventMap[label.xpac].push({
            ...label,
            timeUntil: nextEvent.timeUntil,
            nextEvent: nextEvent.time,
          })
        });

        for (let xpacKey in eventMap) {
          eventMap[xpacKey] = eventMap[xpacKey]
            .sort((a,b) => {
              if (a.nextEvent === b.nextEvent) {
               return a.name.charCodeAt(0) - b.name.charCodeAt(0);
              }
              return a.timeUntil - b.timeUntil
            })
            .slice(0, count);
        }

        return eventMap;
      }));
  }

  getNextEventsTimer(count: number = 5): Observable<EventMap> {
    return timer(0, 15000)
      .pipe(
        switchMap(() => this.getNextEvents(count)),
      )
  }

  private getNextEvent(times: Date[]): NextEvent {
    let currentDate = moment.utc();

    let nextEvent = moment(times[0], ['H:mm']).utc(true)
      .add(1, "day"); // Logic here is that it's probably the next day if we don't find a matching event, one day Ill think more about this
    for (let i = 0; i < times.length; i++) {
      const time = moment(times[i], ['H:mm']).utc(true);
      if (currentDate < time) {
        nextEvent = time;
        break;
      }
    }

    return {
      timeUntil: Math.abs(nextEvent.diff(currentDate, "minutes", true)),
      time: nextEvent.toDate(),
    };
  }

}
