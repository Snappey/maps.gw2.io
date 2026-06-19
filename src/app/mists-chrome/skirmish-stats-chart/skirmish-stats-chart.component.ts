import {Component, Input, OnInit} from '@angular/core';
import {Match, WvwService} from "../../../services/wvw.service";
import {TEAM_COLORS} from "../../../lib/ol/mists-layers";
import { Bind } from 'primeng/bind';
import { UIChart } from 'primeng/chart';

interface ChartData {
  labels: string[]
  datasets: any[],
}

@Component({
    selector: 'app-skirmish-stats-chart',
    templateUrl: './skirmish-stats-chart.component.html',
    styleUrls: ['./skirmish-stats-chart.component.css'],
    imports: [Bind, UIChart]
})
export class SkirmishStatsChartComponent implements OnInit {
  @Input()
  height: string = "100%";

  @Input()
  match!: Match;

  skirmishStats: ChartData | undefined;
  chartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        display: false,
      }
    },
    interaction: {
      intersect: false,
      mode: 'index',
    },
    scales: {
      RunningTotal: {
        ticks: {
          color: "#FFCC66",
          font: "PT Serif"
        },
        type: 'linear',
        position: 'right',
      },
      PerSkirmish: {
        ticks: {
          color: "#FFCC66",
          font: "PT Serif"
        },
        type: 'linear',
        position: 'left',
      },
      xAxis: {
        ticks: {
          color: "#FFCC66",
          font: "PT Serif"
        }
      }
    },
    animation: {
      duration: 0
    }
  }

  constructor(private wvwService: WvwService) {
  }

  ngOnInit() {
    // TODO: This will be a problem if worlds ever change (Alliances?)
    const matchRegion = this.match.all_worlds.red.some(worldId => worldId.toString().startsWith("2")) ? "eu" : "us"
    const lastReset = this.wvwService.getLastResetTime(matchRegion);
    const skirmishIntervalHours = 2;
    this.skirmishStats = {
      labels: Object.keys(this.match.skirmishes).map((_, i) => {
        if (!lastReset) {
          return _;
        }
        const d = new Date(lastReset.getTime() + skirmishIntervalHours * i * 60 * 60 * 1000);
        const pad = (n: number) => n.toString().padStart(2, "0");
        // "ddd, HH:mm A" e.g. "Fri, 18:00 PM"
        return `${d.toLocaleDateString("en-US", {weekday: "short"})}, ${pad(d.getHours())}:${pad(d.getMinutes())} ${d.getHours() < 12 ? "AM" : "PM"}`;
      }),
      datasets: [
        {
          type: 'line',
          label: this.match.all_worlds_names.red.join(", "),
          data: this.runningTotal(this.match.skirmishes.map(s => s.scores.red)),
          borderColor: TEAM_COLORS["red"],
          yAxisID: "RunningTotal",
          xAxisID: "xAxis"
        },
        {
          type: 'line',
          label: this.match.all_worlds_names.blue.join(", "),
          data: this.runningTotal(this.match.skirmishes.map(s => s.scores.blue)),
          borderColor: TEAM_COLORS["blue"],
          yAxisID: "RunningTotal",
          xAxisID: "xAxis"
        },
        {
          type: 'line',
          label: this.match.all_worlds_names.green.join(", "),
          data: this.runningTotal(this.match.skirmishes.map(s => s.scores.green)),
          borderColor: TEAM_COLORS["green"],
          yAxisID: "RunningTotal",
          xAxisID: "xAxis"
        },
        {
          type: 'bar',
          label: this.match.all_worlds_names.red.join(", "),
          data: this.match.skirmishes.map(s => s.scores.red),
          backgroundColor: TEAM_COLORS["red"],
          yAxisID: "PerSkirmish",
          xAxisID: "xAxis"
        },
        {
          type: 'bar',
          label: this.match.all_worlds_names.blue.join(", "),
          data: this.match.skirmishes.map(s => s.scores.blue),
          backgroundColor: TEAM_COLORS["blue"],
          yAxisID: "PerSkirmish",
          xAxisID: "xAxis"
        },
        {
          type: 'bar',
          label: this.match.all_worlds_names.green.join(", "),
          data: this.match.skirmishes.map(s => s.scores.green),
          backgroundColor: TEAM_COLORS["green"],
          yAxisID: "PerSkirmish",
          xAxisID: "xAxis"
        },
      ]
    }
  }

  runningTotal(arr: number[]) {
    return arr.reduce((res: number[], cur, i) => {
      if (res.length > 0) {
        res.push(res[i - 1] + cur);
      } else {
        res.push(cur)
      }

      return res;
    }, []);
  }
}
