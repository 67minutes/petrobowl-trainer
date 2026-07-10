import { describe, expect, it } from "vitest";
import { applyStreak, type StreakState } from "@/lib/gamification/streak";

function state(overrides: Partial<StreakState> = {}): StreakState {
  return {
    current_streak: 0,
    longest_streak: 0,
    last_active_date: null,
    streak_freezes: 0,
    ...overrides
  };
}

describe("applyStreak", () => {
  it("starts a streak on the first ever review", () => {
    const result = applyStreak(state(), "2026-07-10");
    expect(result.current_streak).toBe(1);
    expect(result.longest_streak).toBe(1);
    expect(result.last_active_date).toBe("2026-07-10");
    expect(result.incremented).toBe(true);
  });

  it("is a no-op for a second review the same day", () => {
    const result = applyStreak(
      state({ current_streak: 3, longest_streak: 5, last_active_date: "2026-07-10" }),
      "2026-07-10"
    );
    expect(result.current_streak).toBe(3);
    expect(result.incremented).toBe(false);
  });

  it("increments on a consecutive day", () => {
    const result = applyStreak(
      state({ current_streak: 3, longest_streak: 3, last_active_date: "2026-07-09" }),
      "2026-07-10"
    );
    expect(result.current_streak).toBe(4);
    expect(result.longest_streak).toBe(4);
  });

  it("resets when a day is missed and no freeze is available", () => {
    const result = applyStreak(
      state({ current_streak: 8, longest_streak: 8, last_active_date: "2026-07-08" }),
      "2026-07-10"
    );
    expect(result.current_streak).toBe(1);
    expect(result.longest_streak).toBe(8); // longest preserved
    expect(result.usedFreeze).toBe(false);
  });

  it("consumes a freeze to preserve the streak across a missed day", () => {
    const result = applyStreak(
      state({ current_streak: 8, longest_streak: 8, last_active_date: "2026-07-08", streak_freezes: 2 }),
      "2026-07-10"
    );
    expect(result.current_streak).toBe(9);
    expect(result.streak_freezes).toBe(1);
    expect(result.usedFreeze).toBe(true);
  });

  it("awards a bonus freeze when reaching a 7-multiple", () => {
    const result = applyStreak(
      state({ current_streak: 6, longest_streak: 6, last_active_date: "2026-07-09" }),
      "2026-07-10"
    );
    expect(result.current_streak).toBe(7);
    expect(result.awardedFreeze).toBe(true);
    expect(result.streak_freezes).toBe(1);
  });
});
