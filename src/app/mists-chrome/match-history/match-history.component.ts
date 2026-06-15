import {Component, Input, OnChanges} from "@angular/core";
import {CommonModule} from "@angular/common";
import {Match, Scores} from "../../../services/wvw.service";

const TEAMS = ["red", "blue", "green"];

interface HistoryRow {
  label: string;
  scores: Scores;
}

interface TotalRow {
  label: string;
  values: {[team: string]: string};
}

/**
 * The in-game "Match History" tab: per-skirmish war scores (newest first)
 * under the match totals, with team-coloured column headers.
 */
@Component({
  selector: "app-match-history",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./match-history.component.html",
  styleUrls: ["./match-history.component.css"],
})
export class MatchHistoryComponent implements OnChanges {
  @Input()
  match!: Match;

  teams = TEAMS;
  teamNames: {[team: string]: string} = {};
  skirmishRows: HistoryRow[] = [];
  totalRows: TotalRow[] = [];

  ngOnChanges(): void {
    const match = this.match;
    this.teamNames = Object.fromEntries(
      TEAMS.map(team => [team, match.friendly_names?.[team] ?? team]));

    this.skirmishRows = [...match.skirmishes].reverse().map((skirmish, i) => ({
      label: i === 0 ? "Current" : i === 1 ? "Previous" : `${skirmish.id}`,
      scores: skirmish.scores,
    }));

    const perTeam = (format: (team: string) => string) =>
      Object.fromEntries(TEAMS.map(team => [team, format(team)]));
    this.totalRows = [
      {label: "War Score (Total)", values: perTeam(t => this.num(match.scores?.[t]))},
      {label: "Victory Points (Total)", values: perTeam(t => this.num(match.victory_points?.[t]))},
      {
        label: "Kill/Death (Total)",
        values: perTeam(t => {
          const deaths = match.deaths?.[t] ?? 0;
          return deaths ? ((match.kills?.[t] ?? 0) / deaths).toFixed(2) : "-";
        }),
      },
    ];
  }

  private num(value: number | undefined): string {
    return (value ?? 0).toLocaleString("en-US");
  }
}
