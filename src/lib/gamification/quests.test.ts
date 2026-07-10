import { describe, expect, it } from "vitest";
import {
  dayNumberFromDate,
  pickDailyQuests,
  questProgress,
  QUEST_CATALOG,
  type DailyAggregate
} from "@/lib/gamification/quests";

function agg(overrides: Partial<DailyAggregate> = {}): DailyAggregate {
  return { reviews: 0, correct: 0, distinctTopics: 0, maxCombo: 0, ...overrides };
}

describe("pickDailyQuests", () => {
  it("returns 3 distinct quests", () => {
    const quests = pickDailyQuests(dayNumberFromDate("2026-07-10"), 123);
    expect(quests).toHaveLength(3);
    expect(new Set(quests.map((q) => q.key)).size).toBe(3);
  });

  it("is deterministic for the same day+player", () => {
    const day = dayNumberFromDate("2026-07-10");
    const a = pickDailyQuests(day, 42).map((q) => q.key);
    const b = pickDailyQuests(day, 42).map((q) => q.key);
    expect(a).toEqual(b);
  });

  it("differs across players (at least sometimes)", () => {
    const day = dayNumberFromDate("2026-07-10");
    const a = pickDailyQuests(day, 1).map((q) => q.key).join(",");
    const b = pickDailyQuests(day, 2).map((q) => q.key).join(",");
    const c = pickDailyQuests(day, 3).map((q) => q.key).join(",");
    expect(new Set([a, b, c]).size).toBeGreaterThan(1);
  });

  it("only returns quests from the catalog", () => {
    const keys = new Set(QUEST_CATALOG.map((q) => q.key));
    for (const quest of pickDailyQuests(dayNumberFromDate("2026-07-11"), 7)) {
      expect(keys.has(quest.key)).toBe(true);
    }
  });
});

describe("questProgress", () => {
  it("counts reviews toward review quests, capped at target", () => {
    expect(questProgress("reviews_20", agg({ reviews: 12 }))).toBe(12);
    expect(questProgress("reviews_20", agg({ reviews: 99 }))).toBe(20);
  });

  it("counts correct answers", () => {
    expect(questProgress("correct_15", agg({ correct: 7 }))).toBe(7);
  });

  it("counts distinct topics and combos", () => {
    expect(questProgress("topics_3", agg({ distinctTopics: 2 }))).toBe(2);
    expect(questProgress("combo_10", agg({ maxCombo: 10 }))).toBe(10);
  });
});
