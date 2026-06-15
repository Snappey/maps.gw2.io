import {Component, Input, OnChanges} from '@angular/core';
import {FullMatchObjective, ObjectiveTiers, WvwService} from "../../../services/wvw.service";
import {Guild, GuildService} from "../../../services/guild.service";
import {map, Observable, timer} from "rxjs";
import { NgClass, AsyncPipe } from '@angular/common';
import { Tooltip } from 'primeng/tooltip';

@Component({
    selector: 'app-objective-details',
    templateUrl: './objective-details.component.html',
    styleUrls: ['./objective-details.component.css'],
    imports: [NgClass, Tooltip, AsyncPipe]
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
      map(() => ObjectiveDetailsComponent.formatHeldFor(
        Date.now() - new Date(this.objective.last_flipped).getTime()))
    );

    this.upgradeDetails$ = this.wvwService.getObjectiveTiers(this.objective.upgrade_id);

    if (this.objective.claimed_by) {
      this.guildDetails$ = this.guildService.getGuild(this.objective.claimed_by)
    }
  }

  get guildEmblem(): string {
    return `https://emblem.werdes.net/emblem/${this.objective.claimed_by}`
  }

  /** Elapsed time as "HH h, mm m, ss s", wrapping at 24h (as moment.utc did). */
  private static formatHeldFor(elapsedMs: number): string {
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(Math.floor(totalSeconds / 3600) % 24)} h, ${pad(Math.floor((totalSeconds % 3600) / 60))} m, ${pad(totalSeconds % 60)} s`;
  }
}
