import {Tier} from "./wvw.model";
import {
  calculateUpgradeLevel,
  calculateUpgradeProgress,
  cumulativeYakThresholds,
  hasUpgradeLevel,
} from "./wvw-scoring";

/** A tier schedule with the per-tier yak deltas the API returns (upgrades unused here). */
const schedule = (...yaksPerTier: number[]): Tier[] =>
  yaksPerTier.map((yaks_required, i) => ({name: `Tier ${i}`, yaks_required, upgrades: []}));

describe("WvW yak upgrade calculations", () => {
  // Thresholds are per-objective (a keep's tiers sum to 100 yaks, a tower's to 60).
  // The old hard-coded 20/60/140 mis-tiered everything but the largest keeps.
  const keep = schedule(20, 30, 50); // cumulative [20, 50, 100]
  const tower = schedule(15, 20, 25); // cumulative [15, 35, 60]

  describe("cumulativeYakThresholds", () => {
    it("accumulates per-tier deltas into reach-thresholds", () => {
      expect(cumulativeYakThresholds(keep)).toEqual([20, 50, 100]);
      expect(cumulativeYakThresholds(tower)).toEqual([15, 35, 60]);
    });
  });

  describe("calculateUpgradeLevel", () => {
    it("regression: a keep at 100 yaks is fully Fortified (tier 3), not Reinforced", () => {
      expect(calculateUpgradeLevel(100, keep)).toBe(3);
    });

    it("counts only thresholds the yak total has reached", () => {
      expect(calculateUpgradeLevel(0, keep)).toBe(0);
      expect(calculateUpgradeLevel(19, keep)).toBe(0);
      expect(calculateUpgradeLevel(20, keep)).toBe(1);
      expect(calculateUpgradeLevel(49, keep)).toBe(1);
      expect(calculateUpgradeLevel(50, keep)).toBe(2);
      expect(calculateUpgradeLevel(99, keep)).toBe(2);
    });

    it("is schedule-driven: a tower fortifies at 60, not 140", () => {
      expect(calculateUpgradeLevel(60, tower)).toBe(3);
    });

    it("treats an undefined yak count as un-upgraded", () => {
      expect(calculateUpgradeLevel(undefined, keep)).toBe(0);
    });
  });

  describe("calculateUpgradeProgress", () => {
    it("regression: a keep at 100 yaks shows 20/30/50 — summing to 100, matching the API", () => {
      const progress = keep.map((_, i) => calculateUpgradeProgress(100, keep, i));
      expect(progress).toEqual([20, 30, 50]);
      expect(progress.reduce((a, b) => a + b, 0)).toBe(100);
    });

    it("clamps each tier to its own requirement and never goes negative", () => {
      // 65 yaks: Secured full (20), Reinforced full (30), Fortified part-built (15).
      expect(calculateUpgradeProgress(65, keep, 0)).toBe(20);
      expect(calculateUpgradeProgress(65, keep, 1)).toBe(30);
      expect(calculateUpgradeProgress(65, keep, 2)).toBe(15);
      // 0 yaks: nothing toward any tier.
      expect(calculateUpgradeProgress(0, keep, 2)).toBe(0);
    });

    it("returns 0 for an undefined yak count", () => {
      expect(calculateUpgradeProgress(undefined, keep, 0)).toBe(0);
    });
  });

  describe("hasUpgradeLevel", () => {
    it("is true only once the tier's cumulative threshold is met", () => {
      expect(hasUpgradeLevel(100, keep, 2)).toBe(true);
      expect(hasUpgradeLevel(99, keep, 2)).toBe(false);
      expect(hasUpgradeLevel(50, keep, 1)).toBe(true);
      expect(hasUpgradeLevel(20, keep, 0)).toBe(true);
      expect(hasUpgradeLevel(19, keep, 0)).toBe(false);
    });

    it("returns false for an undefined yak count", () => {
      expect(hasUpgradeLevel(undefined, keep, 0)).toBe(false);
    });
  });
});
