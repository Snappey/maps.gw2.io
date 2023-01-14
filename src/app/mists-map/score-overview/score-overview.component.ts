import {Component, Input, OnInit} from '@angular/core';
import {Match, Scores, WvwService} from "../../../services/wvw.service";

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

  sortedScores: { name: string; score: number }[] = [];
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

  constructor(private wvwService: WvwService) {
  }

  ngOnInit() {
    console.log(this.match);

    this.sortedScores = Object.entries(this.match.victory_points)
      .map(([team, score]) => {
        return {name: team, score}
      }).sort((a,b) => b.score - a.score);

    this.calculateSkirmishStats()
  }

  calculateSkirmishStats() {
    const latestSkirmish = this.match.skirmishes.at(-1)
    if (latestSkirmish) {
      this.skirmishStats = {
        Scores: latestSkirmish.scores,
        Tick: {
          red: this.wvwService.calculateMatchPointsTick(this.match, "red"),
          blue: this.wvwService.calculateMatchPointsTick(this.match, "blue"),
          green: this.wvwService.calculateMatchPointsTick(this.match, "green")
        }
      }
    }
  }
}
