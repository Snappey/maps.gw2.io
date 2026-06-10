import {Injectable} from '@angular/core';
import {map, Observable, of, switchMap, timer} from "rxjs";
import {PointTuple} from "../lib/types";
import * as moment from "moment";
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

  constructor() {
    this.events = events as unknown as Event[]; // TODO: Fix dodgy casting... maybe...?
  }

  getEvents(): Observable<Event[]> {
    return of(this.events)
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
