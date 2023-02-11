import {Component, Input, OnInit} from '@angular/core';
import {Match, WvwService} from "../../../services/wvw.service";
import moment from "moment/moment";

interface ChartData {
  labels: string[]
  datasets: any[],
}

@Component({
  selector: 'app-skirmish-stats-chart',
  templateUrl: './skirmish-stats-chart.component.html',
  styleUrls: ['./skirmish-stats-chart.component.css']
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
        if (lastReset) {
          const skirmishInterval = moment(lastReset).add(2 * i, "hours");
          return skirmishInterval.format("ddd, HH:mm A")
          //lastReset.setTime(lastReset.getTime() + (skirmishIntervalHours * 60 * 60 * 1000));
          //return lastReset.toLocaleDateString() + " " + lastReset.toLocaleTimeString();
        }
        return _;
      }),
      datasets: [
        {
          type: 'line',
          label: this.match.all_worlds_names.red.join(", "),
          data: this.runningTotal(this.match.skirmishes.map(s => s.scores.red)),
          borderColor: "#DC3939",
          yAxisID: "RunningTotal",
          xAxisID: "xAxis"
        },
        {
          type: 'line',
          label: this.match.all_worlds_names.blue.join(", "),
          data: this.runningTotal(this.match.skirmishes.map(s => s.scores.blue)),
          borderColor: "#24A2E7",
          yAxisID: "RunningTotal",
          xAxisID: "xAxis"
        },
        {
          type: 'line',
          label: this.match.all_worlds_names.green.join(", "),
          data: this.runningTotal(this.match.skirmishes.map(s => s.scores.green)),
          borderColor: "#43D071",
          yAxisID: "RunningTotal",
          xAxisID: "xAxis"
        },
        {
          type: 'bar',
          label: this.match.all_worlds_names.red.join(", "),
          data: this.match.skirmishes.map(s => s.scores.red),
          backgroundColor: "#DC3939",
          yAxisID: "PerSkirmish",
          xAxisID: "xAxis"
        },
        {
          type: 'bar',
          label: this.match.all_worlds_names.blue.join(", "),
          data: this.match.skirmishes.map(s => s.scores.blue),
          backgroundColor: "#24A2E7",
          yAxisID: "PerSkirmish",
          xAxisID: "xAxis"
        },
        {
          type: 'bar',
          label: this.match.all_worlds_names.green.join(", "),
          data: this.match.skirmishes.map(s => s.scores.green),
          backgroundColor: "#43D071",
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
