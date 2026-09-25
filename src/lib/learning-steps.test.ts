import { describe, expect, it } from "vitest";
import {
  HARD_DELAY_MS,
  LEARNING_STEPS_MS,
  describeLearning,
  pickLearningCard,
  scheduleLearning,
  upsertLearning
} from "@/lib/learning-steps";
import type { DrillQueueCard } from "@/types/drill";

function makeCard(questionId: string, isNew = false): DrillQueueCard {
  return {
    questionId,
    topicId: "t1",
    question: "Q",
    answer: "A",
    acceptedAnswers: ["A"],
    imageUrl: null,
    imageCaption: null,
    topic: "Topic",
    isNew,
    progress: { easeFactor: 2.5, intervalDays: 0, repetitions: 0 }
  };
}

const NOW = 1_000_000;

describe("learning steps", () => {
  it("brings an Again card back after the first step", () => {
    const next = scheduleLearning(makeCard("q1"), undefined, "again", NOW);
    expect(next).toMatchObject({ step: 0, dueAt: NOW + LEARNING_STEPS_MS[0] });
  });

  it("restarts the steps on Again even from a later step", () => {
    const card = makeCard("q1");
    const next = scheduleLearning(card, { card, step: 1, dueAt: NOW }, "again", NOW);
    expect(next).toMatchObject({ step: 0 });
  });

  it("holds the step on Hard with a medium delay", () => {
    const card = makeCard("q1");
    const next = scheduleLearning(card, { card, step: 1, dueAt: NOW }, "hard", NOW);
    expect(next).toMatchObject({ step: 1, dueAt: NOW + HARD_DELAY_MS });
  });

  it("advances on Good and graduates after the last step", () => {
    const card = makeCard("q1");
    const afterFirst = scheduleLearning(card, { card, step: 0, dueAt: NOW }, "good", NOW);
    expect(afterFirst).toMatchObject({ step: 1, dueAt: NOW + LEARNING_STEPS_MS[1] });
    expect(scheduleLearning(card, afterFirst!, "good", NOW)).toBeNull();
  });

  it("gives a new card one spaced check on Good but lets a known card through", () => {
    expect(scheduleLearning(makeCard("q1", true), undefined, "good", NOW)).toMatchObject({ step: 1 });
    expect(scheduleLearning(makeCard("q2", false), undefined, "good", NOW)).toBeNull();
  });

  it("graduates immediately on Easy", () => {
    const card = makeCard("q1", true);
    expect(scheduleLearning(card, undefined, "easy", NOW)).toBeNull();
    expect(scheduleLearning(card, { card, step: 0, dueAt: NOW }, "easy", NOW)).toBeNull();
  });

  it("picks only due cards unless forced, earliest first", () => {
    const early = { card: makeCard("q1"), step: 0, dueAt: NOW + 5_000 };
    const late = { card: makeCard("q2"), step: 0, dueAt: NOW + 50_000 };
    expect(pickLearningCard([late, early], NOW)).toBeNull();
    expect(pickLearningCard([late, early], NOW, true)?.card.questionId).toBe("q1");
    expect(pickLearningCard([late, early], NOW + 60_000)?.card.questionId).toBe("q1");
    expect(pickLearningCard([], NOW, true)).toBeNull();
  });

  it("replaces or removes a card's entry", () => {
    const entry = { card: makeCard("q1"), step: 0, dueAt: NOW };
    const moved = { ...entry, step: 1 };
    expect(upsertLearning([entry], "q1", moved)).toEqual([moved]);
    expect(upsertLearning([entry], "q1", null)).toEqual([]);
  });

  it("describes the outcome", () => {
    expect(describeLearning(null, NOW)).toBe("Learned for this session");
    expect(describeLearning({ card: makeCard("q1"), step: 0, dueAt: NOW + 60_000 }, NOW)).toBe("Back in 1 min");
  });
});
