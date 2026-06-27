import { describe, expect, it } from "vitest";
import { buildSessionQuestionPool } from "@/lib/session-pool";

const topics = [{ id: "t1" }, { id: "t2" }, { id: "t3" }, { id: "t4" }];
const assignments = [
  { topicId: "t1", playerId: "p1" },
  { topicId: "t2", playerId: "p2" },
  { topicId: "t3", playerId: "p3" }
];
const questions = [
  { id: "q1", topicId: "t1" },
  { id: "q2", topicId: "t1" },
  { id: "q3", topicId: "t2" },
  { id: "q4", topicId: "t3" },
  { id: "q5", topicId: "t4" }
];

describe("buildSessionQuestionPool", () => {
  it("builds a topic-only manual pool", () => {
    const pool = buildSessionQuestionPool({
      topicMode: "topics",
      participantIds: ["p1", "p2"],
      selectedTopicIds: ["t2"],
      topics,
      assignments,
      questions
    });

    expect([...pool.topicSources.entries()]).toEqual([["t2", "manual"]]);
    expect(pool.questions).toEqual([{ id: "q3", topicId: "t2", assignedTo: "p2", balanceGroup: "p2" }]);
  });

  it("builds a player-assigned pool from selected participants", () => {
    const pool = buildSessionQuestionPool({
      topicMode: "playerAssigned",
      participantIds: ["p1", "p2"],
      selectedTopicIds: ["t3"],
      topics,
      assignments,
      questions
    });

    expect([...pool.topicSources.entries()]).toEqual([
      ["t1", "assigned"],
      ["t2", "assigned"]
    ]);
    expect(pool.questions.map((question) => question.id)).toEqual(["q1", "q2", "q3"]);
  });

  it("adds extra topics to player-assigned topics", () => {
    const pool = buildSessionQuestionPool({
      topicMode: "playerAssignedPlus",
      participantIds: ["p1"],
      selectedTopicIds: ["t3", "t4"],
      topics,
      assignments,
      questions
    });

    expect([...pool.topicSources.entries()]).toEqual([
      ["t1", "assigned"],
      ["t3", "extra"],
      ["t4", "extra"]
    ]);
    expect(pool.questions.map((question) => question.id)).toEqual(["q1", "q2", "q4", "q5"]);
  });

  it("balances nonparticipant-owned extra topics as extra while preserving owner", () => {
    const pool = buildSessionQuestionPool({
      topicMode: "playerAssignedPlus",
      participantIds: ["p1"],
      selectedTopicIds: ["t3"],
      topics,
      assignments,
      questions
    });

    const extraQuestion = pool.questions.find((question) => question.id === "q4");
    expect(extraQuestion).toMatchObject({ assignedTo: "p3", balanceGroup: "extra" });
  });

  it("deduplicates repeated topics", () => {
    const pool = buildSessionQuestionPool({
      topicMode: "topics",
      participantIds: ["p1"],
      selectedTopicIds: ["t1", "t1"],
      topics,
      assignments,
      questions
    });

    expect([...pool.topicSources.keys()]).toEqual(["t1"]);
    expect(pool.questions.map((question) => question.id)).toEqual(["q1", "q2"]);
  });

  it("rejects empty participants, topics, and question pools", () => {
    expect(() =>
      buildSessionQuestionPool({
        topicMode: "topics",
        participantIds: [],
        selectedTopicIds: ["t1"],
        topics,
        assignments,
        questions
      })
    ).toThrow("Select at least one participant.");

    expect(() =>
      buildSessionQuestionPool({
        topicMode: "topics",
        participantIds: ["p1"],
        selectedTopicIds: [],
        topics,
        assignments,
        questions
      })
    ).toThrow("Select at least one topic.");

    expect(() =>
      buildSessionQuestionPool({
        topicMode: "topics",
        participantIds: ["p1"],
        selectedTopicIds: ["t1"],
        topics,
        assignments,
        questions: []
      })
    ).toThrow("No eligible questions.");
  });
});
