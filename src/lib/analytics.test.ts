import { describe, expect, it } from "vitest";
import {
  buildDrillFrequencyDays,
  buildPersonalSuggestions,
  buildWeeklyDrillBuckets,
  rankWeakTopics,
  selectLatestCompletedSession
} from "@/lib/analytics";

describe("analytics aggregations", () => {
  it("ranks weak topics using due pressure, Again marks, and slow recall", () => {
    const topics = rankWeakTopics({
      today: "2026-06-08",
      questions: [
        { id: "q1", topicId: "t1", topic: "Drilling" },
        { id: "q2", topicId: "t1", topic: "Drilling" },
        { id: "q3", topicId: "t2", topic: "Production" }
      ],
      progressRows: [
        { questionId: "q1", easeFactor: 1.7, intervalDays: 2, nextReview: "2026-06-08" },
        { questionId: "q2", easeFactor: 2.1, intervalDays: 4, nextReview: "2026-06-09" },
        { questionId: "q3", easeFactor: 2.6, intervalDays: 30, nextReview: "2026-07-01" }
      ],
      responses: [
        { questionId: "q1", rating: "again", responseTimeMs: 18000, reviewedAt: "2026-06-07T00:00:00Z" },
        { questionId: "q1", rating: "hard", responseTimeMs: 16000, reviewedAt: "2026-06-08T00:00:00Z" },
        { questionId: "q3", rating: "easy", responseTimeMs: 3000, reviewedAt: "2026-06-08T00:00:00Z" }
      ]
    });

    expect(topics[0]).toMatchObject({
      topicId: "t1",
      topic: "Drilling",
      dueCount: 1,
      againCount: 1,
      slowCount: 2
    });
    expect(topics[0].weaknessScore).toBeGreaterThan(topics[1].weaknessScore);
  });

  it("builds daily and weekly drill frequency buckets", () => {
    const days = buildDrillFrequencyDays(
      [
        { questionId: "q1", rating: "good", responseTimeMs: 1000, reviewedAt: "2026-06-07T12:00:00Z" },
        { questionId: "q2", rating: "again", responseTimeMs: 2000, reviewedAt: "2026-06-07T13:00:00Z" },
        { questionId: "q3", rating: "easy", responseTimeMs: 1000, reviewedAt: "2026-06-08T12:00:00Z" }
      ],
      new Date("2026-06-08T00:00:00Z"),
      7
    );
    const weeks = buildWeeklyDrillBuckets(days);

    expect(days).toHaveLength(7);
    expect(days.at(-2)).toMatchObject({ date: "2026-06-07", reviews: 2, correct: 1, accuracy: 50 });
    expect(weeks).toEqual([
      {
        label: "Week 1",
        startDate: "2026-06-02",
        endDate: "2026-06-08",
        reviews: 3,
        correct: 2,
        accuracy: 67
      }
    ]);
  });

  it("selects the most recently completed session", () => {
    const latest = selectLatestCompletedSession([
      { id: "s1", name: "Old", createdAt: "2026-06-01T00:00:00Z", completedAt: "2026-06-02T00:00:00Z" },
      { id: "s2", name: "New", createdAt: "2026-06-03T00:00:00Z", completedAt: "2026-06-04T00:00:00Z" }
    ]);

    expect(latest?.id).toBe("s2");
  });

  it("orders personalized suggestions by concrete training pressure", () => {
    const suggestions = buildPersonalSuggestions({
      dueToday: 35,
      reviewedLast7: 20,
      consistencyDays: 2,
      latestSession: null,
      weakTopics: [
        {
          topicId: "t1",
          topic: "Drilling Fluid",
          assignedQuestions: 100,
          seenQuestions: 50,
          dueCount: 12,
          masteredCount: 4,
          reviews: 40,
          againCount: 9,
          slowCount: 6,
          averageEase: 1.8,
          accuracy: 78,
          weaknessScore: 44
        }
      ]
    });

    expect(suggestions.map((suggestion) => suggestion.id)).toEqual([
      "due-backlog",
      "weak-t1",
      "frequency-repair"
    ]);
    expect(suggestions[0]).toMatchObject({ priority: "high", mode: "due" });
  });
});
