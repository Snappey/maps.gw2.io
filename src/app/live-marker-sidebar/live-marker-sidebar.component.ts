import { Component } from '@angular/core';
import {LiveMarkersService} from "../../services/live-markers.service";

interface LiveMarkerInfo {
  AccountName: string;
  CharacterName: string;
}

@Component({
  selector: 'app-live-marker-sidebar',
  templateUrl: './live-marker-sidebar.component.html',
  styleUrls: ['./live-marker-sidebar.component.css']
})
export class LiveMarkerSidebarComponent {
  activeMarkers$ = this.liveMarkerService.activeMarkers$;

  constructor(private liveMarkerService: LiveMarkersService) {
  }
}
