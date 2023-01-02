import {Component, Input, OnInit} from '@angular/core';
import {Match, Scores} from "../../../services/wvw.service";

interface SkirmishSummary {
  Scores: Scores
  Tick: Scores
}

@Component({
  selector: 'app-score-overview',
  templateUrl: './score-overview.component.html',
  styleUrls: ['./score-overview.component.css']
})
export class ScoreOverviewComponent implements OnInit {
  @Input()
  loading: boolean = true;
  @Input()
  match!: Match;
  @Input()
  small: boolean = false;

  skirmishStats: SkirmishSummary = {
    Scores: {
      red: 0,
      green: 0,
      blue: 0
    },
    Tick: {
      red: 0,
      green: 0,
      blue: 0,
    }
  }

  constructor() {
  }

  ngOnInit() {
    console.log(this.match);
    const latestSkirmish = this.match.skirmishes.at(-1)
    if (latestSkirmish) {
      this.skirmishStats = {
        Scores: latestSkirmish.scores,
        Tick: {
          red: this.calculateMatchPointsTick(this.match, "red"),
          blue: this.calculateMatchPointsTick(this.match, "blue"),
          green: this.calculateMatchPointsTick(this.match, "green")
        }
      }
    }
  }

  calculateMatchPointsTick(match: Match, team: string): number {
    return match.maps.flat()
      .map(o => o.objectives).flat()
      .filter(o => o.owner.toLowerCase() === team.toLowerCase())
      .map(o => o.points_tick).reduce((total, cur) => total + cur);
  }
}
