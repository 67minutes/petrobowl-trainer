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
        { id: "q1", assignedTo: "p1", buzzedBy: "p1", correct: true },
        { id: "q2", assignedTo: "p1", buzzedBy: null, correct: false },
        { id: "q3", assignedTo: "p2", buzzedBy: "p1", correct: true },
        { id: "q4", assignedTo: null, buzzedBy: "p2", correct: true }
      ]
    );

    expect(scores.find((score) => score.playerId === "p1")).toMatchObject({
      onTopic: 1,
      outOfTopic: 1,
      missedTopic: 1
    });

    expect(scores.find((score) => score.playerId === "p2")).toMatchObject({
      onTopic: 0,
      outOfTopic: 1,
      missedTopic: 1
    });
  });
});
