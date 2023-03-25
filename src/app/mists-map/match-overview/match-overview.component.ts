import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {Match, WvwService} from "../../../services/wvw.service";
import {map, Observable, retry, take, tap} from "rxjs";
import {Store} from "@ngrx/store";
import {AppState} from "../../../state/appState";

@Component({
  selector: 'app-match-overview',
  templateUrl: './match-overview.component.html',
  styleUrls: ['./match-overview.component.css']
})
export class MatchOverviewComponent {

  matches$ = this.store.select(state => state.mists.matches);

  euMatches$ = this.matches$.pipe(
    map(matches => Object.values(matches).filter(m => m.region === "eu"))
  );

  usMatches$ = this.matches$.pipe(
    map(matches => Object.values(matches).filter(m => m.region === "us"))
  );

  matchesLoading$ = this.store.select(state => state.mists.loading);

  @Output()
  clickedMatch = new EventEmitter<Match>();

  constructor(private readonly store: Store<AppState>) {}

  selectedMatch(match: Match) {
    this.clickedMatch.emit(match);
  }
}
