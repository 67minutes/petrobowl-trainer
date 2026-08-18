import { describe, expect, it } from "vitest";
import {
  buildTopicOptions,
  resolveSelectedTopicIds,
  selectNextQuestion
} from "@/lib/drill-queue";

const questions = [
  { id: "q1", topicId: "t1", displayOrder: 1 },
  { id: "q2", topicId: "t1", displayOrder: 2 },
  { id: "q3", topicId: "t2", displayOrder: 1 },
  { id: "q4", topicId: "t2", displayOrder: 2 }
];

const progressRows = [
  { questionId: "q1", easeFactor: 2.5, intervalDays: 10, repetitions: 2, nextReview: "2026-06-07" },
  { questionId: "q2", easeFactor: 1.6, intervalDays: 2, repetitions: 1, nextReview: "2026-06-20" },
  { questionId: "q3", easeFactor: 2.4, intervalDays: 22, repetitions: 3, nextReview: "2026-07-01" }
];

describe("drill queue helpers", () => {
  it("keeps requested topics inside the valid set", () => {
    expect(resolveSelectedTopicIds(["t1", "t2"], ["t2", "unassigned"])).toEqual(["t2"]);
    expect(resolveSelectedTopicIds(["t1", "t2"], ["unassigned"])).toEqual(["t1", "t2"]);
  });

  it("falls back to the default set (assigned only) when nothing valid is requested", () => {
    // Valid = assigned + study; default = assigned only, so study topics are opt-in.
    expect(resolveSelectedTopicIds(["t1", "t2", "s1"], [], ["t1", "t2"])).toEqual(["t1", "t2"]);
    expect(resolveSelectedTopicIds(["t1", "t2", "s1"], ["unknown"], ["t1", "t2"])).toEqual(["t1", "t2"]);
    // A study topic is a valid explicit selection.
    expect(resolveSelectedTopicIds(["t1", "t2", "s1"], ["s1"], ["t1", "t2"])).toEqual(["s1"]);
  });

  it("builds topic options with kind plus due, unseen, mastered, and weak counts", () => {
    const options = buildTopicOptions(
      [
        { id: "t1", name: "Drilling", displayOrder: 1, kind: "assigned" },
        { id: "t2", name: "Production", displayOrder: 2, kind: "assigned" }
      ],
      questions,
      progressRows,
      new Map([["q2", { againCount: 2, averageResponseTimeMs: 17000, lastReviewedAt: "2026-06-08T00:00:00Z" }]]),
      "2026-06-08"
    );

    expect(options[0]).toMatchObject({
      id: "t1",
      kind: "assigned",
      assignedQuestions: 2,
      dueCount: 1,
      unseenCount: 0,
      masteredCount: 0,
      weakCount: 1
    });
    expect(options[1]).toMatchObject({
      id: "t2",
      kind: "assigned",
      assignedQuestions: 2,
      dueCount: 0,
      unseenCount: 1,
      masteredCount: 1
    });
  });

  it("carries the study kind through to the option", () => {
    const options = buildTopicOptions(
      [{ id: "s1", name: "Hydrogen", displayOrder: 22, kind: "study" }],
      [{ id: "sq1", topicId: "s1", displayOrder: 1 }],
      [],
      new Map(),
      "2026-06-08"
    );
    expect(options[0]).toMatchObject({ id: "s1", kind: "study", assignedQuestions: 1 });
  });

  it("orders Smart, Due, Weak, and New modes predictably", () => {
    const responseStatsByQuestionId = new Map([
      ["q2", { againCount: 3, averageResponseTimeMs: 18000, lastReviewedAt: "2026-06-08T00:00:00Z" }]
    ]);

    expect(
      selectNextQuestion({
        mode: "smart",
        today: "2026-06-08",
        questions,
        progressRows,
        responseStatsByQuestionId,
        selectedTopicIds: ["t1", "t2"],
        remainingNewCardsToday: 1
      })?.id
    ).toBe("q1");

    expect(
      selectNextQuestion({
        mode: "weak",
        today: "2026-06-08",
        questions,
        progressRows,
        responseStatsByQuestionId,
        selectedTopicIds: ["t1", "t2"],
        remainingNewCardsToday: 1
      })?.id
    ).toBe("q2");

    expect(
      selectNextQuestion({
        mode: "new",
        today: "2026-06-08",
        questions,
        progressRows,
        responseStatsByQuestionId,
        selectedTopicIds: ["t1", "t2"],
        remainingNewCardsToday: 1
      })?.id
    ).toBe("q4");

    expect(
      selectNextQuestion({
        mode: "new",
        today: "2026-06-08",
        questions,
        progressRows,
        responseStatsByQuestionId,
        selectedTopicIds: ["t1", "t2"],
        remainingNewCardsToday: 0
      })
    ).toBeNull();
  });
});
