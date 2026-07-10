import { describe, expect, it } from "vitest";
import { comboMultiplier, xpForReview, type ReviewXpContext } from "@/lib/gamification/xp";

function ctx(overrides: Partial<ReviewXpContext> = {}): ReviewXpContext {
  return {
    rating: "good",
    combo: 1,
    wasNew: false,
    masteryCrossed: false,
    firstReviewOfDay: false,
    doubleXp: false,
    ...overrides
  };
}

describe("comboMultiplier", () => {
  it("ramps at 5/10/20", () => {
    expect(comboMultiplier(1)).toBe(1);
    expect(comboMultiplier(4)).toBe(1);
    expect(comboMultiplier(5)).toBe(1.25);
    expect(comboMultiplier(10)).toBe(1.5);
    expect(comboMultiplier(20)).toBe(2);
  });
});

describe("xpForReview", () => {
  it("awards base XP for a plain correct review", () => {
    expect(xpForReview(ctx()).xp).toBe(10);
  });

  it("gives minimal XP and no combo bonus for 'again'", () => {
    const reward = xpForReview(ctx({ rating: "again", combo: 0 }));
    expect(reward.xp).toBe(2);
    expect(reward.coins).toBe(0);
  });

  it("applies the combo multiplier to the base only", () => {
    // base 10 * 1.5 = 15, then +20 first-of-day = 35 (bonus not multiplied by combo)
    const reward = xpForReview(ctx({ combo: 12, firstReviewOfDay: true }));
    expect(reward.xp).toBe(35);
  });

  it("stacks new-card and mastery bonuses", () => {
    // 10 + 5 (new) + 25 (mastery) = 40
    expect(xpForReview(ctx({ wasNew: true, masteryCrossed: true })).xp).toBe(40);
  });

  it("doubles the total when doubleXp is active", () => {
    expect(xpForReview(ctx({ doubleXp: true })).xp).toBe(20);
  });

  it("awards at least one coin for any correct answer", () => {
    expect(xpForReview(ctx()).coins).toBe(1);
  });
});
