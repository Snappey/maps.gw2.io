import {Component, Input, OnChanges} from "@angular/core";
import {CommonModule} from "@angular/common";
import {Match, WvwService} from "../../../services/wvw.service";

/** Left-to-right segment order of the in-game war score bar. */
const TEAMS = ["red", "blue", "green"];

interface TeamPlate {
  team: string;
  name: string;
  score: number;
  ppt: number;
  bloodlust: number[];
}

/**
 * Compact war-score HUD modelled on the in-game widget: a segmented bar
 * proportional to the current skirmish score, plus one plate per team with
 * points-per-tick and bloodlust. No tick/skirmish countdowns: the API serves
 * no timers, and deriving them from match start drifts from the real cadence.
 */
@Component({
  selector: "app-war-score-bar",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./war-score-bar.component.html",
  styleUrls: ["./war-score-bar.component.css"],
})
export class WarScoreBarComponent implements OnChanges {
  @Input()
  match!: Match;
  @Input()
  small = false;

  plates: TeamPlate[] = [];
  segments: {team: string, pct: number}[] = [];

  constructor(private wvwService: WvwService) {
  }

  ngOnChanges(): void {
    const match = this.match;
    const scores = match.skirmishes.at(-1)?.scores ?? {red: 0, blue: 0, green: 0};
    const total = TEAMS.reduce((sum, team) => sum + (scores[team] ?? 0), 0) || 1;
    this.segments = TEAMS.map(team => ({team, pct: ((scores[team] ?? 0) / total) * 100}));
    this.plates = TEAMS.map(team => ({
      team,
      name: match.friendly_names?.[team] ?? team,
      score: scores[team] ?? 0,
      ppt: this.wvwService.calculateMatchPointsTick(match, team),
      bloodlust: match.maps
        .filter(m => m.bonuses?.some(b => b.type === "Bloodlust" && b.owner.toLowerCase() === team))
        .map(m => m.id),
    }));
  }
}
