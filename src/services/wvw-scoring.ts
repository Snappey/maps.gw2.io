import {Match, Tier} from "./wvw.model";

/**
 * Stateless WvW scoring/upgrade arithmetic: pure functions over the match feed
 * and per-objective tier schedules — no HTTP, no Angular — so they're trivially
 * unit-testable (see wvw.service.spec.ts). WvwService delegates to these.
 */

/** Tier segment of the match id, e.g. "2-1" → "1". */
export function getTier(match: Match): string {
  return match.id.split("-")[1];
}

/** Region from the match id: ids starting "1" are US, everything else EU. */
export function getRegion(match: Match): string {
  return match.id.split("-")[0] === "1" ? "us" : "eu";
}

function getLastDayOccurence(date: Date, day: "sun" | "mon" | "tue" | "wed" | "thurs" | "fri" | "sat"): Date {
  const d = new Date(date.getTime());
  const days = ['sun', 'mon', 'tue', 'wed', 'thurs', 'fri', 'sat'];
  if (days.includes(day)) {
    const modifier = (d.getDay() + days.length - days.indexOf(day)) % 7 || 7;
    d.setDate(d.getDate() - modifier);
  }
  return d;
}

export function getLastResetTime(region: "eu" | "us"): Date | undefined {
  let resetDay = undefined;
  switch (region) {
    case "eu":
      resetDay = getLastDayOccurence(new Date(), "fri")
      resetDay.setHours(18, 0, 0)
      break;
    case "us":
      resetDay = getLastDayOccurence(new Date(), "sat")
      resetDay.setHours(2, 0, 0)
  }

  return resetDay;
}

/**
 * Cumulative yaks needed to *reach* each tier, in tier order. The API gives
 * per-tier deltas, so a keep's [20, 30, 50] becomes [20, 50, 100]: Secured at
 * 20, Reinforced at 50, Fortified at 100 yaks delivered. These totals differ
 * per objective (a tower or camp fortifies at a different count), so they must
 * come from the objective's own schedule — never hard-code them.
 */
export function cumulativeYakThresholds(tiers: Tier[]): number[] {
  let sum = 0;
  return tiers.map(tier => (sum += tier.yaks_required));
}

/** Yaks counted toward tier `tierIndex`, clamped to that tier's requirement. */
export function calculateUpgradeProgress(yaksDelivered: number | undefined, tiers: Tier[], tierIndex: number): number {
  if (yaksDelivered === undefined) {
    return 0;
  }

  const reachedBefore = tierIndex > 0 ? cumulativeYakThresholds(tiers)[tierIndex - 1] : 0;
  return Math.min(Math.max(yaksDelivered - reachedBefore, 0), tiers[tierIndex].yaks_required);
}

/** Highest tier built (0 = none … tiers.length) for the delivered yak count. */
export function calculateUpgradeLevel(yaksDelivered: number | undefined, tiers: Tier[]): number {
  if (yaksDelivered === undefined) {
    return 0;
  }

  return cumulativeYakThresholds(tiers).filter(threshold => yaksDelivered >= threshold).length;
}

export function getFriendlyUpgradeLevel(level: number): string {
  switch (level) {
    case 3:
      return "Fortified";
    case 2:
      return "Reinforced";
    case 1:
      return "Secured";
    default:
      return "N/A"
  }
}

/** Whether tier `tierIndex` is fully built for the delivered yak count. */
export function hasUpgradeLevel(yaksDelivered: number | undefined, tiers: Tier[], tierIndex: number): boolean {
  if (yaksDelivered === undefined) {
    return false;
  }

  return yaksDelivered >= cumulativeYakThresholds(tiers)[tierIndex];
}

export function calculateMatchPointsTick(match: Match, team: string): number {
  return match.maps.flat()
    .map(o => o.objectives).flat()
    .filter(o => o.owner.toLowerCase() === team.toLowerCase())
    .map(o => o.points_tick).reduce((total, cur) => total + cur, 0);
}
