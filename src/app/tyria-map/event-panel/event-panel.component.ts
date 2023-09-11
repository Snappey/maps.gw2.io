import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {Event} from "../../../services/event-timer.service";
import {ClipboardService} from "ngx-clipboard";
import {ToastrService} from "ngx-toastr";

@Component({
  selector: 'app-event-panel',
  templateUrl: './event-panel.component.html',
  styleUrls: ['./event-panel.component.css']
})
export class EventPanelComponent implements OnInit {
  @Input()
  event!: Event;

  @Output()
  clickedEvent: EventEmitter<Event> = new EventEmitter<Event>();

  eventTime: Date | undefined;
  hovering: boolean = false;

  constructor(private clipboardService: ClipboardService, private toastr: ToastrService) { }

  ngOnInit(): void {
    if (this.event) {
      this.eventTime= new Date();
      this.eventTime.setMinutes(this.eventTime.getMinutes() + this.event.timeUntil)
    }
  }

  copyToClipboard($click: MouseEvent, event: Event) {
    this.clipboardService.copy(event.chatLink);
    this.toastr.info("Copied closest waypoint to clipboard!", event.name, {
      toastClass: "custom-toastr",
      positionClass: "toast-top-right"
    });

    $click.stopPropagation();
  }

  openWiki($click: MouseEvent, event: Event) {
    window.open(`https://wiki.guildwars2.com/wiki/?search=${event.name}&ns0=1`);

    $click.stopPropagation();
  }

  onClick(event: Event) {
    this.clickedEvent.emit(event)
  }
}
