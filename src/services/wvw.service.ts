import {Injectable} from '@angular/core';
import {HttpClient} from "@angular/common/http";
import {catchError, combineLatest, forkJoin, map, Observable, of, switchMap} from "rxjs";
import {GuildService} from "./guild.service";
import {preloadImage} from "../lib/preload-image";
import {cacheById} from "../lib/http-cache";
import {
  FullMatchObjective, Match, MatchOverview, Objective, ObjectiveTiers,
  staticWorldNames, Tier, World, WorldDictionary,
} from "./wvw.model";
import * as scoring from "./wvw-scoring";

// Domain types live in wvw.model.ts; re-exported here so existing
// `import {Match, ...} from ".../wvw.service"` sites keep working.
export type * from "./wvw.model";

@Injectable({
  providedIn: 'root'
})
export class WvwService {

  private objectiveTiersCache: {[id: string]: Observable<ObjectiveTiers>} = {};

  constructor(private httpClient: HttpClient, private guildService: GuildService) { }

  listObjectives(): Observable<string[]> {
    return this.httpClient.get<string[]>(`https://api.guildwars2.com/v2/wvw/objectives`);
  }

  getObjectiveDetails(id: string): Observable<Objective> {
    return this.httpClient.get<Objective>(`https://api.guildwars2.com/v2/wvw/objectives/${id}`);
  }

  getAllObjectives(): Observable<Objective[]> {
    return this.httpClient.get<Objective[]>(`/assets/data/mists_objectives.json`);
  }

  getAllMatchDetails(): Observable<Match[]> {
    return this.httpClient.get<string[]>(`https://api.guildwars2.com/v2/wvw/matches`)
      .pipe(
        switchMap(ids => combineLatest(ids.map(id => this.getMatchDetails(id))))
      )
  }

  getObjectiveTiers(id: number): Observable<ObjectiveTiers> {
    // Cached + in-flight de-duped (a hover prefetch can race the click that
    // opens the dialog); cacheById evicts on error so failures don't stick.
    return cacheById(this.objectiveTiersCache, String(id), () =>
      this.httpClient.get<ObjectiveTiers>(`https://api.guildwars2.com/v2/wvw/upgrades/${id}`));
  }

  getMatchDetails(id: string): Observable<Match> {
    return this.httpClient.get<Match>(`https://api.guildwars2.com/v2/wvw/matches/${id}`)
      .pipe(
        switchMap(match => this.mapWorldNames(match)),
        switchMap(match => this.mapObjectives(match))
      );
  }

  getMatchDetailsByWorldId(worldId: string): Observable<Match> {
    return this.httpClient.get<Match>(`https://api.guildwars2.com/v2/wvw/matches?world=${worldId}`)
      .pipe(
        switchMap(match => this.mapWorldNames(match))
      );
  }

  getWorldNames(ids: string[]): Observable<WorldDictionary> {
    return this.httpClient.get<World[]>(`https://api.guildwars2.com/v2/worlds?ids=${ids.join(",")}`)
      .pipe(
        map(worlds => worlds.reduce((res: WorldDictionary, cur) => {
          if (!(cur.id in res)) {
            res[cur.id] = cur;
          }

          return res;
        }, {}))
      )
  }

  getMatchOverviewByWorldId(worldId: string): Observable<MatchOverview> {
    return this.httpClient.get<MatchOverview>(`https://api.guildwars2.com/v2/wvw/matches/overview?world=${worldId}`)
  }

  /**
   * Warm the browser cache for the images the objective-details dialog renders
   * (tier-upgrade icons, claimed guild upgrades and emblem) so they don't pop
   * in when the dialog opens. Driven by hover; safe to call repeatedly.
   */
  prefetchObjectiveAssets(objective: FullMatchObjective): void {
    this.getObjectiveTiers(objective.upgrade_id).subscribe(({tiers}) => {
      for (const tier of tiers) {
        preloadImage(`assets/${tier.name.toLowerCase()}.png`);
        tier.upgrades.forEach(upgrade => preloadImage(upgrade.icon));
      }
    });

    for (const upgradeId of objective.guild_upgrades ?? []) {
      this.guildService.getGuildUpgrade(upgradeId).subscribe(upgrade => preloadImage(upgrade.icon));
    }

    if (objective.claimed_by) {
      preloadImage(`https://emblem.werdes.net/emblem/${objective.claimed_by}`);
    }
  }

  /** Fills in the `// Custom` world-name/tier/region fields from the static dictionary. */
  private mapWorldNames(match: Match): Observable<Match> {
    const worlds = staticWorldNames;
    const getWorldName = (id: string) => id in worlds ? worlds[id].name : "Unknown";

    match.all_worlds_names = {
      red: [getWorldName(match.worlds.red.toString())],
      green: [getWorldName(match.worlds.green.toString())],
      blue: [getWorldName(match.worlds.blue.toString())]
    }
    match.friendly_names = {
      red: match.all_worlds_names.red.join(", "),
      green: match.all_worlds_names.green.join(", "),
      blue: match.all_worlds_names.blue.join(", ")
    }
    match.tier = scoring.getTier(match);
    match.region = scoring.getRegion(match);

    return of(match);
  }

  /** Joins live match objectives with their static details and resolves each upgrade tier. */
  private mapObjectives(match: Match): Observable<Match> {
    return this.getAllObjectives().pipe(
      switchMap(objectives => {
        const matchObjs = match.maps.map(m => m.objectives).flat();
        match.objectives = matchObjs.reduce((res: FullMatchObjective[], matchObj) => {
          const obj = objectives.find(o => matchObj.id === o.id);
          if (obj) {
            res.push({...obj, ...matchObj, friendlyOwner: match.friendly_names[matchObj.owner.toLowerCase()]})
          }

          return res;
        }, []);

        // Yak thresholds differ per objective, so the live yak total alone
        // can't tell us the built tier — resolve each schedule from
        // /wvw/upgrades (cached). A failed/absent schedule falls back to
        // tier 0 rather than breaking the whole match feed.
        const upgradeIds = [...new Set(match.objectives.map(o => o.upgrade_id))];
        if (upgradeIds.length === 0) {
          return of(match);
        }

        return forkJoin(upgradeIds.map(id =>
          this.getObjectiveTiers(id).pipe(
            map(({tiers}) => [id, tiers] as const),
            catchError(() => of([id, [] as Tier[]] as const)),
          ),
        )).pipe(
          map(entries => {
            const schedules: {[id: number]: Tier[]} = {};
            for (const [id, tiers] of entries) {
              schedules[id] = tiers;
            }
            for (const obj of match.objectives) {
              obj.upgrade_tier = scoring.calculateUpgradeLevel(obj.yaks_delivered, schedules[obj.upgrade_id] ?? []);
            }
            return match;
          }),
        );
      })
    )
  }

  // --- Scoring facade: logic lives in wvw-scoring.ts; these thin delegators
  //     keep the API stable for the components and templates that call them. ---

  getTier(match: Match): string {
    return scoring.getTier(match);
  }

  getRegion(match: Match): string {
    return scoring.getRegion(match);
  }

  getLastResetTime(region: "eu" | "us"): Date | undefined {
    return scoring.getLastResetTime(region);
  }

  cumulativeYakThresholds(tiers: Tier[]): number[] {
    return scoring.cumulativeYakThresholds(tiers);
  }

  calculateUpgradeProgress(yaksDelivered: number | undefined, tiers: Tier[], tierIndex: number): number {
    return scoring.calculateUpgradeProgress(yaksDelivered, tiers, tierIndex);
  }

  calculateUpgradeLevel(yaksDelivered: number | undefined, tiers: Tier[]): number {
    return scoring.calculateUpgradeLevel(yaksDelivered, tiers);
  }

  getFriendlyUpgradeLevel(level: number): string {
    return scoring.getFriendlyUpgradeLevel(level);
  }

  hasUpgradeLevel(yaksDelivered: number | undefined, tiers: Tier[], tierIndex: number): boolean {
    return scoring.hasUpgradeLevel(yaksDelivered, tiers, tierIndex);
  }

  calculateMatchPointsTick(match: Match, team: string): number {
    return scoring.calculateMatchPointsTick(match, team);
  }
}
