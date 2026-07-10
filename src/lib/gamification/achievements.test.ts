import { describe, expect, it } from "vitest";
import { checkAchievements, type AchievementContext } from "@/lib/gamification/achievements";

function ctx(overrides: Partial<AchievementContext> = {}): AchievementContext {
  return {
    level: 1,
    currentStreak: 0,
    totalReviews: 0,
    totalMastered: 0,
    combo: 0,
    ...overrides
  };
}

describe("checkAchievements", () => {
  it("unlocks first_drill on the first review", () => {
    expect(checkAchievements(ctx({ totalReviews: 1 }), new Set())).toContain("first_drill");
  });

  it("does not re-unlock what is already unlocked", () => {
    const unlocked = new Set(["first_drill"]);
    expect(checkAchievements(ctx({ totalReviews: 5 }), unlocked)).not.toContain("first_drill");
  });

  it("unlocks all thresholds crossed at once, in catalog order", () => {
    const result = checkAchievements(
      ctx({ totalReviews: 120, currentStreak: 7, level: 5 }),
      new Set()
    );
    expect(result).toEqual(
      expect.arrayContaining(["first_drill", "streak_3", "streak_7", "level_5", "reviews_100"])
    );
    // catalog order: streak_3 before streak_7
    expect(result.indexOf("streak_3")).toBeLessThan(result.indexOf("streak_7"));
  });

  it("unlocks mastery and combo milestones", () => {
    expect(checkAchievements(ctx({ totalMastered: 100 }), new Set())).toContain("mastered_100");
    expect(checkAchievements(ctx({ combo: 25 }), new Set())).toContain("combo_25");
  });

  it("returns nothing when no thresholds are met", () => {
    expect(checkAchievements(ctx(), new Set())).toEqual([]);
  });
});
