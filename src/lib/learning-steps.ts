import type { ReviewRating } from "@/lib/sm2";
import type { DrillQueueCard } from "@/types/drill";

// Short-term learning steps layered on top of the day-based SM-2 schedule: a
// card you miss comes back within minutes in the same session instead of
// tomorrow. Only the first rating of a card per session reaches the server;
// the re-shows are practice, so they cannot inflate the long-term interval.
export const LEARNING_STEPS_MS = [60_000, 10 * 60_000];
export const HARD_DELAY_MS = 5 * 60_000;

export type LearningEntry = {
  card: DrillQueueCard;
  step: number;
  dueAt: number;
};

// Returns the card's next learning entry, or null when it leaves the loop
// (learned for this session, or a known card that never needed steps).
export function scheduleLearning(
  card: DrillQueueCard,
  previous: LearningEntry | undefined,
  rating: ReviewRating,
  now: number
): LearningEntry | null {
  if (rating === "easy") {
    return null;
  }

  if (rating === "again") {
    return { card, step: 0, dueAt: now + LEARNING_STEPS_MS[0] };
  }

  if (rating === "hard") {
    return { card, step: previous?.step ?? 0, dueAt: now + HARD_DELAY_MS };
  }

  // "good": a known review card graduates straight away; a new card still gets
  // one spaced check; a learning card advances a step.
  if (!previous && !card.isNew) {
    return null;
  }
  const nextStep = previous ? previous.step + 1 : 1;
  return nextStep < LEARNING_STEPS_MS.length
    ? { card, step: nextStep, dueAt: now + LEARNING_STEPS_MS[nextStep] }
    : null;
}

export function upsertLearning(entries: LearningEntry[], questionId: string, next: LearningEntry | null) {
  const rest = entries.filter((entry) => entry.card.questionId !== questionId);
  return next ? [...rest, next] : rest;
}

// The earliest entry that is due. With `force`, the earliest entry regardless,
// used when the regular queue has nothing left so the session never stalls.
export function pickLearningCard(entries: LearningEntry[], now: number, force = false) {
  const sorted = [...entries].sort((left, right) => left.dueAt - right.dueAt);
  const first = sorted[0];
  if (!first) {
    return null;
  }
  return force || first.dueAt <= now ? first : null;
}

export function describeLearning(next: LearningEntry | null, now: number) {
  if (!next) {
    return "Learned for this session";
  }
  const minutes = Math.max(1, Math.round((next.dueAt - now) / 60_000));
  return `Back in ${minutes} min`;
}
