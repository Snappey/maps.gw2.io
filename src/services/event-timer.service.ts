import {Injectable} from '@angular/core';
import {Observable, of, switchMap, timer} from "rxjs";
import {PointTuple} from "../lib/types";
import data from "../assets/data/event_timers.json";

// One upcoming-event row: a single phase of a meta event, next start relative to "now".
export interface Event {
  timeUntil: number; // minutes until the next start
  nextEvent: Date;
  name: string;
  meta: string; // parent event/meta name (the wiki "event")
  chatLink: string;
  portrait: string | undefined;
  coordinates: PointTuple;
  xpac: string;
  map: string;
  durationMinutes: number;
}

export interface EventMap {
  [xpac: string]: Event[];
}

// --- shape of event_timers.json (produced by scripts/generate_event_timers.mjs) ---
interface RawPhase {
  segmentId: string;
  name: string;
  link: string | null;
  chatLink: string | null;
  map: string;
  coordinates: PointTuple;
  durationMinutes: number;
  offsets: number[]; // minute-of-day starts, UTC, repeating daily
}

interface RawEvent {
  key: string;
  name: string;
  category: string;
  xpac: string;
  map: string;
  coordinates: PointTuple;
  cycleMinutes: number;
  portrait?: string;
  phases: RawPhase[];
}

interface RawEventData {
  version: string;
  events: {[key: string]: RawEvent};
}

const DAY = 1440; // minutes

@Injectable({
  providedIn: 'root'
})
export class EventTimerService {
  // JSON import is typed structurally (e.g. number[] rather than tuples), so an
  // unchecked cast to the authored shape is unavoidable here.
  private readonly events: RawEvent[] = Object.values((data as unknown as RawEventData).events);

  getNextEvents(count: number = 5): Observable<EventMap> {
    return of(this.buildEventMap(count));
  }

  getNextEventsTimer(count: number = 5): Observable<EventMap> {
    return timer(0, 15000).pipe(
      switchMap(() => this.getNextEvents(count)),
    );
  }

  private buildEventMap(count: number): EventMap {
    const nowMin = (Date.now() / 60000) % DAY; // minute of the current UTC day
    const eventMap: EventMap = {};

    for (const ev of this.events) {
      for (const phase of ev.phases) {
        const {timeUntil, nextEvent} = this.nextOccurrence(phase.offsets, nowMin);
        (eventMap[ev.xpac] ??= []).push({
          timeUntil,
          nextEvent,
          name: phase.name,
          meta: ev.name,
          chatLink: phase.chatLink ?? "",
          portrait: ev.portrait,
          coordinates: phase.coordinates,
          xpac: ev.xpac,
          map: phase.map || ev.map,
          durationMinutes: phase.durationMinutes,
        });
      }
    }

    for (const xpac of Object.keys(eventMap)) {
      eventMap[xpac] = eventMap[xpac]
        .sort((a, b) => a.timeUntil - b.timeUntil || a.name.localeCompare(b.name))
        .slice(0, count);
    }

    return eventMap;
  }

  // Next start, in minutes from now, among a phase's minute-of-day offsets
  // (the schedule repeats daily). nextEvent is the matching absolute Date.
  private nextOccurrence(offsets: number[], nowMin: number): {timeUntil: number; nextEvent: Date} {
    let best = Infinity;
    for (const o of offsets) {
      const delta = o > nowMin ? o - nowMin : o - nowMin + DAY;
      if (delta < best) best = delta;
    }
    if (!Number.isFinite(best)) best = 0;
    return {timeUntil: best, nextEvent: new Date(Date.now() + best * 60000)};
  }
}
