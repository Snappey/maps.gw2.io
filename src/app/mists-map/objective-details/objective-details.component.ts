import {Component, Input, OnChanges, OnDestroy, OnInit} from '@angular/core';
import {FullMatchObjective, ObjectiveTiers, WvwService} from "../../../services/wvw.service";
import {Guild, GuildService} from "../../../services/guild.service";
import {interval, map, Observable, timer} from "rxjs";
import moment from "moment";
import {MenuItem} from "primeng/api";
import {Menu} from "primeng/menu";

@Component({
  selector: 'app-objective-details',
  templateUrl: './objective-details.component.html',
  styleUrls: ['./objective-details.component.css']
})
export class ObjectiveDetailsComponent implements OnChanges {
  @Input()
  objective!: FullMatchObjective;

  guildDetails$: Observable<Guild> | undefined;
  upgradeDetails$: Observable<ObjectiveTiers> | undefined;
  heldFor$: Observable<string> | undefined;
  emblemLoaded: boolean = false;

  constructor(public guildService: GuildService, public wvwService: WvwService) {
  }

  ngOnChanges() {
    this.emblemLoaded = false;

    this.heldFor$ = timer(0, 1000).pipe(
      map(() => moment.utc(
        moment.duration(
          moment().diff(this.objective.last_flipped)).asMilliseconds()
        ).format("HH [h], mm [m], ss [s]")
      )
    );

    this.upgradeDetails$ = this.wvwService.getObjectiveTiers(this.objective.upgrade_id);

    if (this.objective.claimed_by) {
      this.guildDetails$ = this.guildService.getGuild(this.objective.claimed_by)
    }
  }

  get guildEmblem(): string {
    return `https://emblem.werdes.net/emblem/${this.objective.claimed_by}`
  }

  get Math() {
    return Math;
  }
}
