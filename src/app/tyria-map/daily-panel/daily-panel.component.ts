import {Component, Input, OnInit} from '@angular/core';
import {AchievementDetails, DailyService} from "../../../services/daily.service";

enum State {
  Expanded = "expanded",
  Compact = "compact",
}

@Component({
  selector: 'app-daily-panel',
  templateUrl: './daily-panel.component.html',
  styleUrls: ['./daily-panel.component.css']
})
export class DailyPanelComponent implements OnInit {
  @Input()
  achievement!: AchievementDetails;
  requirements: string = "";
  maps: string[] = [];

  hovering: boolean = false;
  state: State = State.Compact;

  constructor() { }

  ngOnInit(): void {
    if (this.achievement) {
      const reqs = this.achievement.requirement.split(":");
      if (reqs.length > 1) {
        this.maps = reqs[1].split(",");
        this.requirements = reqs[0];

        if (!this.achievement.description) {
          this.achievement.description = "Unknown";
        }
      }
    }
  }

  getIcon(type: string | undefined) {
    switch(type) {
      case "pve":
        return "https://render.guildwars2.com/file/483E3939D1A7010BDEA2970FB27703CAAD5FBB0F/42684.png"
      case "pvp":
        return "https://render.guildwars2.com/file/FE01AF14D91F52A1EF2B22FE0A552B9EE2E4C3F6/511340.png"
      case "wvw":
        return "https://render.guildwars2.com/file/2BBA251A24A2C1A0A305D561580449AF5B55F54F/338457.png"
      case "fractals":
        return "https://render.guildwars2.com/file/4A5834E40CDC6A0C44085B1F697565002D71CD47/1228226.png"
      default:
        return "https://render.guildwars2.com/file/483E3939D1A7010BDEA2970FB27703CAAD5FBB0F/42684.png"
    }
  }

  onClick($click: MouseEvent) {
    switch(this.state) {
      case State.Compact:
        this.state = State.Expanded;
        break;
      case State.Expanded:
        this.state = State.Compact;
        break;
    }
  }
}
