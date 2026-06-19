import {Component, inject, Input, OnChanges} from "@angular/core";
import {map, Observable, takeWhile, timer} from "rxjs";
import {FullMatchObjective, WvwService} from "../../../services/wvw.service";
import {Guild, GuildService} from "../../../services/guild.service";
import {RECENT_FLIP_WINDOW_MS, RI_TYPES} from "../../../lib/ol/mists-layers";
import { NgClass, AsyncPipe } from "@angular/common";

/** Emergency Waypoint guild tactic (api: /v2/guild/upgrades/178). */
const EMERGENCY_WAYPOINT_UPGRADE_ID = 178;

interface RiState {
  active: boolean;
  text: string;
}

/**
 * Hover card for a map objective, laid out like the in-game map tooltip:
 * team-coloured name, type + tier pips, waypoint row, points per tick, then
 * controlling world and claiming guild. The RI countdown is a web extra.
 */
@Component({
    selector: "app-objective-tooltip",
    templateUrl: "./objective-tooltip.component.html",
    styleUrls: ["./objective-tooltip.component.css"],
    imports: [NgClass, AsyncPipe]
})
export class ObjectiveTooltipComponent implements OnChanges {
  @Input()
  obj!: FullMatchObjective;

  private wvwService = inject(WvwService);
  private guildService = inject(GuildService);

  tier = 0;
  tierName = "";
  tierPips: number[] = [];
  hasWaypoint = false;
  ewpSlotted = false;
  guild$?: Observable<Guild>;
  ri$?: Observable<RiState>;

  ngOnChanges(): void {
    const obj = this.obj;
    this.tier = obj.upgrade_tier ?? 0;
    this.tierName = this.wvwService.getFriendlyUpgradeLevel(this.tier);
    this.tierPips = Array(this.tier).fill(0);

    const canWaypoint = obj.type === "Keep" || obj.type === "Castle";
    this.hasWaypoint = canWaypoint && this.tier === 3;
    // Slotted is the most the API exposes — activation isn't reported.
    this.ewpSlotted = canWaypoint && !this.hasWaypoint &&
      (obj.guild_upgrades ?? []).some(id => Number(id) === EMERGENCY_WAYPOINT_UPGRADE_ID);

    this.guild$ = obj.claimed_by ? this.guildService.getGuild(obj.claimed_by) : undefined;

    this.ri$ = undefined;
    if (obj.last_flipped && RI_TYPES.has(obj.type)) {
      const expiry = new Date(obj.last_flipped).getTime() + RECENT_FLIP_WINDOW_MS;
      if (Date.now() < expiry) {
        this.ri$ = timer(0, 1000).pipe(
          map(() => Math.max(0, Math.ceil((expiry - Date.now()) / 1000))),
          takeWhile(seconds => seconds > 0, true),
          map(seconds => ({
            active: seconds > 0,
            text: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
          })),
        );
      }
    }
  }
}
