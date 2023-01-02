import { Component, OnInit } from '@angular/core';
import {CookieService} from "ngx-cookie";

enum MapTypes {
  Tyria = "Tyria",
  Mists = "Mists"
}

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {
  COOKIE_SELECTED_MAP: string = "gw2.io_map" as const;
  selectedMap: MapTypes = MapTypes.Tyria;

  constructor(private cookieService: CookieService) {}

  ngOnInit(): void {
    if (this.cookieService.hasKey(this.COOKIE_SELECTED_MAP)) {
      const cookieVal = this.cookieService.get(this.COOKIE_SELECTED_MAP);
      if (cookieVal && cookieVal in MapTypes) {
        this.selectedMap = cookieVal as MapTypes;
      }
    }
  }

  switchMap() {
    switch(this.selectedMap) {
      case MapTypes.Mists:
        this.selectedMap = MapTypes.Tyria;
        break;
      case MapTypes.Tyria:
        this.selectedMap = MapTypes.Mists;
        break;
    }
    this.cookieService.put(this.COOKIE_SELECTED_MAP, this.selectedMap);
  }
}
