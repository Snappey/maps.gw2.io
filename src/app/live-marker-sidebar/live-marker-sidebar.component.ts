import {ChangeDetectionStrategy, Component} from '@angular/core';
import {LiveMarkersService} from "../../services/live-markers.service";

@Component({
  selector: 'app-live-marker-sidebar',
  templateUrl: './live-marker-sidebar.component.html',
  styleUrls: ['./live-marker-sidebar.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LiveMarkerSidebarComponent {
  activeMarkers$ = this.liveMarkerService.activeMarkers$;

  constructor(private liveMarkerService: LiveMarkersService) {
  }
}
