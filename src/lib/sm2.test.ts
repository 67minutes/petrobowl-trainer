import { describe, expect, it } from "vitest";
import { reviewCard } from "@/lib/sm2";

const reviewedAt = new Date("2026-06-06T00:00:00.000Z");

describe("reviewCard", () => {
  it("resets interval and repetitions for Again", () => {
    const result = reviewCard(
      { easeFactor: 2.5, intervalDays: 8, repetitions: 3 },
      "again",
      reviewedAt
    );

    expect(result.intervalDays).toBe(1);
    expect(result.repetitions).toBe(0);
    expect(result.nextReview).toBe("2026-06-07");
  });

  it("decreases ease and grows the interval for Hard", () => {
    const result = reviewCard(
      { easeFactor: 2.5, intervalDays: 10, repetitions: 2 },
      "hard",
      reviewedAt
    );

    expect(result.easeFactor).toBeCloseTo(2.35);
    expect(result.intervalDays).toBe(12);
    expect(result.repetitions).toBe(3);
  });

  it("increases ease and interval for Easy", () => {
    const result = reviewCard(
      { easeFactor: 2.5, intervalDays: 2, repetitions: 1 },
      "easy",
      reviewedAt
    );

    expect(result.easeFactor).toBeCloseTo(2.65);
    expect(result.intervalDays).toBe(7);
  });
});
