import {Component, EventEmitter, Output} from '@angular/core';
import {Match, WvwService} from "../../../services/wvw.service";
import {map, Observable} from "rxjs";

@Component({
  selector: 'app-match-overview',
  templateUrl: './match-overview.component.html',
  styleUrls: ['./match-overview.component.css']
})
export class MatchOverviewComponent {
  euMatches: Match[] = [];
  usMatches: Match[] = [];

  @Output()
  clickedMatch = new EventEmitter<Match>();

  constructor(public wvwService: WvwService) {
    wvwService.getAllMatchDetails()
      .subscribe(matches => {
        this.euMatches = matches.filter(m => m.region === "eu");
        this.usMatches = matches.filter(m => m.region === "us");
      });
  }

  selectedMatch(match: Match) {
    this.clickedMatch.emit(match);
  }
}
