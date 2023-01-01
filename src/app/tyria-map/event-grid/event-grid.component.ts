import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {Event, EventMap} from "../../../services/event-timer.service";

@Component({
  selector: 'app-event-grid',
  templateUrl: './event-grid.component.html',
  styleUrls: ['./event-grid.component.css']
})
export class EventGridComponent implements OnInit {

  @Input()
  upcomingEvents: EventMap = {};
  friendlyXpacNames: any = {
    "core": "Core",
    "hot": "Heart of Thorns",
    "pof": "Path of Fire",
    "ibs": "Icebrood Saga",
    "eod": "End of Dragons"
  }

  @Output()
  eventClicked: EventEmitter<Event> = new EventEmitter<Event>();


  constructor() { }

  ngOnInit(): void {
  }

  forwardsEvent($event: Event) {
    this.eventClicked.emit($event);
  }
}
