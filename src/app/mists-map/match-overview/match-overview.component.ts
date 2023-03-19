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
  euMatches: Match[] = [];
  usMatches: Match[] = [];

  matches$ = this.store.select(state => state.mists.matches);
  matchesLoading$ = this.store.select(state => state.mists.loading);
  loading: boolean = true;

  @Output()
  clickedMatch = new EventEmitter<Match>();

  constructor(private readonly store: Store<AppState>) {
    this.matches$.pipe(
      retry(3),
      take(1)
    ).subscribe(matches => {
      this.euMatches = Object.values(matches).filter(m => m.region === "eu");
      this.usMatches = Object.values(matches).filter(m => m.region === "us");
    });

    this.matchesLoading$.subscribe(loading => this.loading = loading);
  }

  selectedMatch(match: Match) {
    this.clickedMatch.emit(match);
  }
}
