import { describe, expect, it } from "vitest";
import { calculateSessionScores } from "@/lib/scoring";

describe("calculateSessionScores", () => {
  it("counts on-topic, out-of-topic, no-buzz, and unowned offense", () => {
    const scores = calculateSessionScores(
      [
        { id: "p1", name: "A" },
        { id: "p2", name: "B" }
      ],
      [
        { id: "q1", owners: ["p1"], buzzedBy: "p1", correct: true, missedBy: [] },
        { id: "q2", owners: ["p1"], buzzedBy: null, correct: false, missedBy: [] },
        { id: "q3", owners: ["p2"], buzzedBy: "p1", correct: true, missedBy: [] },
        { id: "q4", owners: [], buzzedBy: "p2", correct: true, missedBy: [] }
      ]
    );

    expect(scores.find((score) => score.playerId === "p1")).toMatchObject({
      onTopic: 1,
      outOfTopic: 1,
      missedTopic: 1,
      wrongBuzzes: 0
    });

    expect(scores.find((score) => score.playerId === "p2")).toMatchObject({
      onTopic: 0,
      outOfTopic: 1,
      missedTopic: 1,
      wrongBuzzes: 0
    });
  });

  it("penalizes only the first non-owner misser on a question", () => {
    const scores = calculateSessionScores(
      [
        { id: "p1", name: "A" },
        { id: "p2", name: "B" },
        { id: "p3", name: "C" }
      ],
      [
        // p1 owns q1; p2 buzzes wrong first, p3 buzzes wrong second, p1 finally answers.
        { id: "q1", owners: ["p1"], buzzedBy: "p1", correct: true, missedBy: ["p2", "p3"] }
      ]
    );

    const p2 = scores.find((score) => score.playerId === "p2");
    const p3 = scores.find((score) => score.playerId === "p3");

    // First misser (p2) penalized once; second misser (p3) untouched.
    expect(p2).toMatchObject({ wrongBuzzes: 1 });
    expect(p2?.offenseBonus).toBe(-100); // (2*0 - 1) / 1 * 100
    expect(p3).toMatchObject({ wrongBuzzes: 0, offenseBonus: 0 });
  });

  it("does not double-penalize an owner who misses their own topic first", () => {
    const scores = calculateSessionScores(
      [{ id: "p1", name: "A" }],
      [{ id: "q1", owners: ["p1"], buzzedBy: null, correct: false, missedBy: ["p1"] }]
    );

    // Owner's own miss is captured by missedTopic (defense), not a wrong-buzz penalty.
    expect(scores[0]).toMatchObject({ missedTopic: 1, wrongBuzzes: 0 });
  });

  it("scores a no-correct-answer outcome like a no-buzz for the owner", () => {
    const noBuzz = calculateSessionScores(
      [{ id: "p1", name: "A" }],
      [{ id: "q1", owners: ["p1"], buzzedBy: null, correct: false, missedBy: [] }]
    );
    const noCorrect = calculateSessionScores(
      [{ id: "p1", name: "A" }],
      [{ id: "q1", owners: ["p1"], buzzedBy: null, correct: false, missedBy: ["p1"] }]
    );

    expect(noCorrect[0].defenseScore).toBe(noBuzz[0].defenseScore);
  });

  it("does not score absent owners when only participants are supplied", () => {
    const scores = calculateSessionScores(
      [
        { id: "p1", name: "A" },
        { id: "p2", name: "B" }
      ],
      [{ id: "q1", owners: ["p3"], buzzedBy: "p1", correct: true, missedBy: [] }]
    );

    expect(scores).toHaveLength(2);
    expect(scores.find((score) => score.playerId === "p1")).toMatchObject({
      outOfTopic: 1,
      missedTopic: 0
    });
    expect(scores.find((score) => score.playerId === "p2")).toMatchObject({
      outOfTopic: 0,
      missedTopic: 0
    });
  });

  it("penalizes the non-answering co-owner normally when an owner answers", () => {
    const scores = calculateSessionScores(
      [
        { id: "p1", name: "A" },
        { id: "p2", name: "B" }
      ],
      // q owned by p1 & p2; p1 answers correctly.
      [{ id: "q1", owners: ["p1", "p2"], buzzedBy: "p1", correct: true, missedBy: [] }]
    );
    const p1 = scores.find((s) => s.playerId === "p1");
    const p2 = scores.find((s) => s.playerId === "p2");
    expect(p1).toMatchObject({ onTopic: 1, missedTopic: 0 });
    // Co-owner p2 takes the full (weight 1) defense penalty: (0 - 0.5*1)/1*100 = -50.
    expect(p2).toMatchObject({ onTopic: 0, missedTopic: 1 });
    expect(p2?.defenseScore).toBe(-50);
  });

  it("splits the steal penalty across co-owners by 1/k", () => {
    const scores = calculateSessionScores(
      [
        { id: "p1", name: "A" },
        { id: "p2", name: "B" },
        { id: "p3", name: "C" }
      ],
      // q owned by p1 & p2; outsider p3 steals it correctly.
      [{ id: "q1", owners: ["p1", "p2"], buzzedBy: "p3", correct: true, missedBy: [] }]
    );
    const p1 = scores.find((s) => s.playerId === "p1");
    // weight 1/2 -> defense (0 - 0.5*0.5)/1*100 = -25.
    expect(p1?.defenseScore).toBe(-25);
    const p3 = scores.find((s) => s.playerId === "p3");
    expect(p3).toMatchObject({ outOfTopic: 1 });
  });

  it("adds +5 per correct bonus without touching defense/offense ratios", () => {
    const scores = calculateSessionScores(
      [
        { id: "p1", name: "A" },
        { id: "p2", name: "B" }
      ],
      [
        // p1 wins their own owned question (defense = 100).
        { id: "q1", owners: ["p1"], buzzedBy: "p1", correct: true, missedBy: [] },
        // Two bonus questions, both won by p1.
        { id: "b1", owners: [], buzzedBy: "p1", correct: true, missedBy: [], isBonus: true },
        { id: "b2", owners: [], buzzedBy: "p1", correct: true, missedBy: [], isBonus: true }
      ]
    );

    const p1 = scores.find((s) => s.playerId === "p1");
    // Bonus rows are invisible to the ratio model: p1 still owns exactly 1 question,
    // owns nothing "other", so defense=100, offense=0.
    expect(p1).toMatchObject({
      ownQuestions: 1,
      otherQuestions: 0,
      outOfTopic: 0,
      bonusCorrect: 2,
      bonusPoints: 10,
      defenseScore: 100,
      offenseBonus: 0
    });
    // total = 0.7*100 + 0.3*0 + 10 = 80.
    expect(p1?.totalScore).toBe(80);
  });

  it("never penalizes a missed or dead bonus question", () => {
    const scores = calculateSessionScores(
      [
        { id: "p1", name: "A" },
        { id: "p2", name: "B" }
      ],
      [
        // p2 buzzed the bonus wrong (locked out), then it died with no correct answer.
        { id: "b1", owners: [], buzzedBy: null, correct: false, missedBy: ["p2"], isBonus: true }
      ]
    );

    const p2 = scores.find((s) => s.playerId === "p2");
    // No wrong-buzz penalty, no offense denominator effect, no bonus points.
    expect(p2).toMatchObject({
      wrongBuzzes: 0,
      otherQuestions: 0,
      offenseBonus: 0,
      bonusCorrect: 0,
      bonusPoints: 0,
      totalScore: 0
    });
  });
});
