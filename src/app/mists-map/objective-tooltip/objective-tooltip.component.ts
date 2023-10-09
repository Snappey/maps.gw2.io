import {Component, Input, OnInit} from '@angular/core';
import {FullMatchObjective, WvwService} from "../../../services/wvw.service";
import {GuildService} from "../../../services/guild.service";

@Component({
  selector: 'app-objective-tooltip',
  templateUrl: './objective-tooltip.component.html',
  styleUrls: ['./objective-tooltip.component.css']
})
export class ObjectiveTooltipComponent implements OnInit {

  @Input()
  obj: FullMatchObjective | undefined;

  @Input()
  teams: {[team: string]: string} = {};

  upgradeLevel: number = 0;
  friendlyUpgradeLevel: string = "N/A";
  constructor(private wvwService: WvwService, public guildService: GuildService) { }

  ngOnInit(): void {
    if (this.obj) {
      this.upgradeLevel = this.wvwService.calculateUpgradeLevel(this.obj.yaks_delivered);
      this.friendlyUpgradeLevel = this.wvwService.getFriendlyUpgradeLevel(this.upgradeLevel);
    }
  }

}
