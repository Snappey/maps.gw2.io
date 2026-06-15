import {Component, EventEmitter, Input, Output} from '@angular/core';
import {Event, EventMap} from "../../services/event-timer.service";
import { EventPanelComponent } from '../event-panel/event-panel.component';
import { KeyValuePipe } from '@angular/common';

@Component({
    selector: 'app-event-grid',
    templateUrl: './event-grid.component.html',
    styleUrls: ['./event-grid.component.css'],
    imports: [EventPanelComponent, KeyValuePipe]
})
export class EventGridComponent {

  @Input()
  upcomingEvents: EventMap = {};

  @Output()
  eventClicked: EventEmitter<Event> = new EventEmitter<Event>();

  constructor() { }

  forwardsEvent($event: Event) {
    this.eventClicked.emit($event);
  }

  friendlyXpacNames: Record<string, string> = {
    "core": "Core",
    "hot": "Heart of Thorns",
    "pof": "Path of Fire",
    "ibs": "Icebrood Saga",
    "eod": "End of Dragons",
    "soto": "Secrets of the Obscure",
    "jw": "Janthir Wilds",
    "voe": "Visions of Eternity",
    "public": "Public Instances"
  }

  friendlyXpacName(key: string): string {
    return this.friendlyXpacNames[key] ?? "Unknown";
  }
}
