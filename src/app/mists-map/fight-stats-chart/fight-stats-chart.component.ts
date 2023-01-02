import {Component, Input, OnInit} from '@angular/core';
import {Match} from "../../../services/wvw.service";
import {Chart} from "chart.js";

interface ChartData {
  labels: string[]
  datasets: any[],
}

@Component({
  selector: 'app-fight-stats-chart',
  templateUrl: './fight-stats-chart.component.html',
  styleUrls: ['./fight-stats-chart.component.css']
})
export class FightStatsChartComponent implements OnInit {
  @Input()
  height: string = "100%";

  @Input()
  match!: Match;

  fightStats: ChartData | undefined;
  chartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        display: true,
        position: "top"
      }
    },
    animation: {
      duration: 0
    }
  }

  ngOnInit() {
    const colours = ["#DC3939", "#24A2E7", "#43D071"]

    this.fightStats = {
      labels: [this.match.all_worlds_names.red.join(", "), this.match.all_worlds_names.blue.join(", "), this.match.all_worlds_names.green.join(", ")],
      datasets: [
        {
          label: "Kills",
          data: Object.values(this.match.kills),
          backgroundColor: colours
        },
        {
          label: "Deaths",
          data: Object.values(this.match.deaths),
          backgroundColor: colours
        },
        {
          label: "Ratio",
          data: Object.entries(this.match.kills).map(([team, kills]) => kills / this.match.deaths[team]),
          backgroundColor: colours
        }
      ]
    }
  }
}
