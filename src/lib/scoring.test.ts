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
        { id: "q1", assignedTo: "p1", buzzedBy: "p1", correct: true, missedBy: [] },
        { id: "q2", assignedTo: "p1", buzzedBy: null, correct: false, missedBy: [] },
        { id: "q3", assignedTo: "p2", buzzedBy: "p1", correct: true, missedBy: [] },
        { id: "q4", assignedTo: null, buzzedBy: "p2", correct: true, missedBy: [] }
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
        { id: "q1", assignedTo: "p1", buzzedBy: "p1", correct: true, missedBy: ["p2", "p3"] }
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
      [{ id: "q1", assignedTo: "p1", buzzedBy: null, correct: false, missedBy: ["p1"] }]
    );

    // Owner's own miss is captured by missedTopic (defense), not a wrong-buzz penalty.
    expect(scores[0]).toMatchObject({ missedTopic: 1, wrongBuzzes: 0 });
  });

  it("scores a no-correct-answer outcome like a no-buzz for the owner", () => {
    const noBuzz = calculateSessionScores(
      [{ id: "p1", name: "A" }],
      [{ id: "q1", assignedTo: "p1", buzzedBy: null, correct: false, missedBy: [] }]
    );
    const noCorrect = calculateSessionScores(
      [{ id: "p1", name: "A" }],
      [{ id: "q1", assignedTo: "p1", buzzedBy: null, correct: false, missedBy: ["p1"] }]
    );

    expect(noCorrect[0].defenseScore).toBe(noBuzz[0].defenseScore);
  });

  it("does not score absent owners when only participants are supplied", () => {
    const scores = calculateSessionScores(
      [
        { id: "p1", name: "A" },
        { id: "p2", name: "B" }
      ],
      [{ id: "q1", assignedTo: "p3", buzzedBy: "p1", correct: true, missedBy: [] }]
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
});
