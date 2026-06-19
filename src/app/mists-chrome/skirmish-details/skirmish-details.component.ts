import {Component, Input, OnChanges} from "@angular/core";
import {DecimalPipe, NgClass} from "@angular/common";
import {ChartModule} from "primeng/chart";
import {WvwMap, Match, WvwService} from "../../../services/wvw.service";
import {TEAM_COLORS} from "../../../lib/ol/mists-layers";

const TEAMS = ["red", "blue", "green"];
const OBJECTIVE_TYPES = ["Camp", "Tower", "Keep", "Castle"];
const DESERT_BORDERLANDS_MAP_ID = 1099;

interface MapFilter {
  key: string;
  label: string;
  mapIds: number[];
}

interface TeamRow {
  team: string;
  name: string;
  skirmishScore: number;
  victoryPoints: number;
  counts: {[type: string]: number};
  ppt: number;
}

/**
 * The in-game "Skirmish Details" panel: team header cards with the current
 * skirmish score, a war-score pie, and the contested-areas / potential-points
 * table, scoped by the per-map filter list on the left.
 */
@Component({
  selector: "app-skirmish-details",
  standalone: true,
  imports: [NgClass, DecimalPipe, ChartModule],
  templateUrl: "./skirmish-details.component.html",
  styleUrls: ["./skirmish-details.component.css"],
})
export class SkirmishDetailsComponent implements OnChanges {
  @Input()
  match!: Match;

  objectiveTypes = OBJECTIVE_TYPES;
  filters: MapFilter[] = [];
  selectedFilter = "all";
  cards: TeamRow[] = [];
  rows: TeamRow[] = [];
  pieData: object = {};
  pieOptions: object = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {legend: {display: false}},
  };

  ngOnChanges(): void {
    this.filters = [
      {key: "all", label: "General", mapIds: this.match.maps.map(m => m.id)},
      ...this.match.maps.map(m => ({key: `${m.id}`, label: this.mapLabel(m), mapIds: [m.id]})),
    ];
    if (!this.filters.some(f => f.key === this.selectedFilter)) {
      this.selectedFilter = "all";
    }

    this.pieData = {
      labels: TEAMS.map(team => this.match.friendly_names?.[team] ?? team),
      datasets: [{
        data: TEAMS.map(team => this.match.scores[team] ?? 0),
        backgroundColor: TEAMS.map(team => TEAM_COLORS[team]),
        borderColor: "#111",
        borderWidth: 2,
      }],
    };

    this.rebuildRows();
  }

  select(filter: MapFilter): void {
    this.selectedFilter = filter.key;
    this.rebuildRows();
  }

  private rebuildRows(): void {
    const filter = this.filters.find(f => f.key === this.selectedFilter) ?? this.filters[0];
    const maps = this.match.maps.filter(m => filter.mapIds.includes(m.id));
    const objectives = maps.flatMap(m => m.objectives);
    const skirmish = this.match.skirmishes.at(-1);
    const skirmishScores = filter.key === "all"
      ? skirmish?.scores
      : skirmish?.map_scores.find(ms => ms.type === maps[0]?.type)?.scores;

    this.rows = TEAMS.map(team => {
      const owned = objectives.filter(o => o.owner.toLowerCase() === team);
      const counts: {[type: string]: number} = {};
      for (const type of OBJECTIVE_TYPES) {
        counts[type] = owned.filter(o => o.type === type).length;
      }
      return {
        team,
        name: this.match.friendly_names?.[team] ?? team,
        skirmishScore: skirmishScores?.[team] ?? 0,
        victoryPoints: this.match.victory_points?.[team] ?? 0,
        counts,
        ppt: owned.reduce((sum, o) => sum + (o.points_tick ?? 0), 0),
      };
    });
    this.cards = [...this.rows].sort((a, b) => b.skirmishScore - a.skirmishScore);
  }

  private mapLabel(m: WvwMap): string {
    if (m.type === "Center") {
      return "Eternal Battlegrounds";
    }
    const team = m.type.replace("Home", "").toLowerCase();
    const world = this.match.friendly_names?.[team] ?? team;
    const kind = m.id === DESERT_BORDERLANDS_MAP_ID ? "Desert" : "Alpine";
    return `${world} ${kind} Borderlands`;
  }
}
