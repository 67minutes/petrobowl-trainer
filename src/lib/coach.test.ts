import { describe, expect, it } from "vitest";
import {
  aggregateOffenseDefense,
  buildPlayerReadiness,
  buildSpeedProfile,
  buildTopicStrengthRow,
  quadrantLabel,
  type CoachDrillRow,
  type CoachProgressRow,
  type CoachSessionQuestion
} from "@/lib/coach";

const topics = [{ id: "t1" }, { id: "t2" }];
const topicByQuestionId = new Map([
  ["q1", "t1"],
  ["q2", "t1"],
  ["q3", "t2"]
]);

describe("buildTopicStrengthRow", () => {
  it("blends study and buzz accuracy weighted by sample size", () => {
    const drillRows: CoachDrillRow[] = [
      { playerId: "p1", questionId: "q1", correct: true, responseTimeMs: 1000, reviewedAt: "2026-06-20" },
      { playerId: "p1", questionId: "q1", correct: true, responseTimeMs: 1000, reviewedAt: "2026-06-21" },
      { playerId: "p1", questionId: "q2", correct: false, responseTimeMs: 1000, reviewedAt: "2026-06-22" }
    ];
    // study on t1: 2 correct of 3 = 66.67%
    const sessionQuestions: CoachSessionQuestion[] = [
      // buzz on t1: p1 correct
      { id: "s1", sessionId: "session-1", topicId: "t1", owners: ["p1"], buzzedBy: "p1", correct: true, missedBy: [] },
      // buzz on t1: p1 missed
      { id: "s2", sessionId: "session-1", topicId: "t1", owners: ["p2"], buzzedBy: "p2", correct: true, missedBy: ["p1"] }
    ];

    const row = buildTopicStrengthRow({
      playerId: "p1",
      topics,
      topicByQuestionId,
      drillRows,
      sessionQuestions,
      ownedTopicIds: new Set(["t1"])
    });

    const t1 = row.find((cell) => cell.topicId === "t1");
    // study: 2/3 over 3 samples; buzz: 1/2 over 2 samples
    // blended = (66.67*3 + 50*2) / 5 = (200 + 100) / 5 = 60
    expect(t1).toMatchObject({
      studySamples: 3,
      studyAccuracy: 67,
      buzzSamples: 2,
      buzzAccuracy: 50,
      blended: 60,
      owned: true,
      thinData: false
    });
  });

  it("flags thin data and zero strength when samples are sparse", () => {
    const row = buildTopicStrengthRow({
      playerId: "p1",
      topics,
      topicByQuestionId,
      drillRows: [
        { playerId: "p1", questionId: "q3", correct: true, responseTimeMs: 1000, reviewedAt: "2026-06-20" }
      ],
      sessionQuestions: [],
      ownedTopicIds: new Set()
    });

    const t2 = row.find((cell) => cell.topicId === "t2");
    expect(t2).toMatchObject({ studySamples: 1, buzzSamples: 0, thinData: true, owned: false });
    const t1 = row.find((cell) => cell.topicId === "t1");
    expect(t1).toMatchObject({ studySamples: 0, buzzSamples: 0, blended: 0, thinData: true });
  });

  it("ignores other players' drills and buzzes", () => {
    const row = buildTopicStrengthRow({
      playerId: "p1",
      topics,
      topicByQuestionId,
      drillRows: [
        { playerId: "p2", questionId: "q1", correct: true, responseTimeMs: 1000, reviewedAt: "2026-06-20" }
      ],
      sessionQuestions: [
        { id: "s1", sessionId: "session-1", topicId: "t1", owners: ["p2"], buzzedBy: "p2", correct: true, missedBy: [] }
      ],
      ownedTopicIds: new Set()
    });
    expect(row.find((cell) => cell.topicId === "t1")).toMatchObject({ studySamples: 0, buzzSamples: 0 });
  });
});

describe("buildPlayerReadiness", () => {
  const today = "2026-06-23";
  const assignedQuestionIds = new Set(["q1", "q2", "q3", "q4"]);
  const progressRows: CoachProgressRow[] = [
    { playerId: "p1", questionId: "q1", intervalDays: 30, nextReview: "2026-06-30" }, // mastered, not due
    { playerId: "p1", questionId: "q2", intervalDays: 5, nextReview: "2026-06-20" }, // due
    { playerId: "p1", questionId: "q3", intervalDays: 25, nextReview: "2026-06-23" }, // mastered, due today
    { playerId: "p2", questionId: "q1", intervalDays: 30, nextReview: "2026-06-01" } // other player ignored
  ];

  it("computes mastery, due backlog, and consistency", () => {
    const drillRows: CoachDrillRow[] = [
      { playerId: "p1", questionId: "q1", correct: true, responseTimeMs: 1000, reviewedAt: "2026-06-21" },
      { playerId: "p1", questionId: "q2", correct: true, responseTimeMs: 1000, reviewedAt: "2026-06-22" },
      { playerId: "p1", questionId: "q3", correct: false, responseTimeMs: 1000, reviewedAt: "2026-06-22" }
    ];
    const readiness = buildPlayerReadiness({ playerId: "p1", assignedQuestionIds, progressRows, drillRows, today });
    expect(readiness).toMatchObject({
      assignedQuestions: 4,
      mastered: 2,
      masteryPct: 50,
      dueBacklog: 2,
      consistencyDays: 2
    });
  });

  it("reports an upward accuracy trend when recent week improves", () => {
    const drillRows: CoachDrillRow[] = [
      // prev 7-day window (2026-06-10 .. 2026-06-16): 1/2 correct = 50%
      { playerId: "p1", questionId: "q1", correct: true, responseTimeMs: 1000, reviewedAt: "2026-06-11" },
      { playerId: "p1", questionId: "q2", correct: false, responseTimeMs: 1000, reviewedAt: "2026-06-12" },
      // last 7-day window (2026-06-17 .. 2026-06-23): 2/2 correct = 100%
      { playerId: "p1", questionId: "q1", correct: true, responseTimeMs: 1000, reviewedAt: "2026-06-19" },
      { playerId: "p1", questionId: "q2", correct: true, responseTimeMs: 1000, reviewedAt: "2026-06-20" }
    ];
    const readiness = buildPlayerReadiness({ playerId: "p1", assignedQuestionIds, progressRows, drillRows, today });
    expect(readiness.accuracyTrend).toBe("up");
  });
});

describe("buildSpeedProfile", () => {
  it("returns min, median, and max of positive response times", () => {
    const drillRows: CoachDrillRow[] = [
      { playerId: "p1", questionId: "q1", correct: true, responseTimeMs: 5000, reviewedAt: "2026-06-20" },
      { playerId: "p1", questionId: "q2", correct: true, responseTimeMs: 1000, reviewedAt: "2026-06-20" },
      { playerId: "p1", questionId: "q3", correct: true, responseTimeMs: 3000, reviewedAt: "2026-06-20" },
      { playerId: "p1", questionId: "q4", correct: true, responseTimeMs: 0, reviewedAt: "2026-06-20" }, // ignored
      { playerId: "p2", questionId: "q1", correct: true, responseTimeMs: 9000, reviewedAt: "2026-06-20" } // other player
    ];
    expect(buildSpeedProfile("p1", drillRows)).toEqual({ samples: 3, minMs: 1000, medianMs: 3000, maxMs: 5000 });
  });

  it("returns zeros when there are no samples", () => {
    expect(buildSpeedProfile("p1", [])).toEqual({ samples: 0, minMs: 0, medianMs: 0, maxMs: 0 });
  });
});

describe("quadrantLabel", () => {
  it("labels by defense and offense signals", () => {
    expect(quadrantLabel(80, 10)).toBe("anchor");
    expect(quadrantLabel(45, 30)).toBe("stealer");
    expect(quadrantLabel(70, -5)).toBe("liability");
    expect(quadrantLabel(30, 10)).toBe("liability");
    expect(quadrantLabel(50, 0)).toBe("balanced");
  });
});

describe("aggregateOffenseDefense", () => {
  it("aggregates resolved questions across the season and assigns a label", () => {
    const questions: CoachSessionQuestion[] = [
      { id: "q1", sessionId: "session-1", topicId: "t1", owners: ["p1"], buzzedBy: "p1", correct: true, missedBy: [] },
      { id: "q2", sessionId: "session-1", topicId: "t1", owners: ["p1"], buzzedBy: "p1", correct: true, missedBy: [] },
      // unresolved open question should be excluded (no penalty to owner)
      { id: "q3", sessionId: "session-1", topicId: "t2", owners: ["p1"], buzzedBy: null, correct: true, missedBy: [] }
    ];
    const result = aggregateOffenseDefense({ id: "p1", name: "A" }, questions);
    expect(result).toMatchObject({ onTopic: 2, ownQuestions: 2, defenseScore: 100 });
    expect(result.label).toBe("anchor");
  });
});
