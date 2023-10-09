import {Component, EventEmitter, Input, Output} from '@angular/core';
import {Event, EventMap} from "../../../services/event-timer.service";

@Component({
  selector: 'app-event-grid',
  templateUrl: './event-grid.component.html',
  styleUrls: ['./event-grid.component.css']
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

  friendlyXpacNames: any = {
    "core": "Core",
    "hot": "Heart of Thorns",
    "pof": "Path of Fire",
    "ibs": "Icebrood Saga",
    "eod": "End of Dragons",
    "soto": "Shadows of the Obscure"
  }

  friendlyXpacName(key: string): string {
    return this.friendlyXpacNames[key] ?? "Unknown";
  }
}
