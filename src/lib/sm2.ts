export type ReviewRating = "again" | "hard" | "good" | "easy";

export type CardState = {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReview?: string;
  lastReviewed?: string | null;
};

export type ReviewedCardState = CardState & {
  nextReview: string;
  lastReviewed: string;
};

const MIN_EASE_FACTOR = 1.3;

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function reviewCard(
  state: CardState,
  rating: ReviewRating,
  reviewedAt = new Date()
): ReviewedCardState {
  const baseInterval = Math.max(1, state.intervalDays || 1);
  let easeFactor = Math.max(MIN_EASE_FACTOR, state.easeFactor || 2.5);
  let intervalDays = baseInterval;
  let repetitions = state.repetitions;

  if (rating === "again") {
    intervalDays = 1;
    repetitions = 0;
  }

  if (rating === "hard") {
    intervalDays = Math.max(1, Math.ceil(baseInterval * 1.2));
    easeFactor = Math.max(MIN_EASE_FACTOR, easeFactor - 0.15);
    repetitions += 1;
  }

  if (rating === "good") {
    intervalDays = Math.max(1, Math.ceil(baseInterval * easeFactor));
    repetitions += 1;
  }

  if (rating === "easy") {
    intervalDays = Math.max(1, Math.ceil(baseInterval * easeFactor * 1.3));
    easeFactor = Math.max(MIN_EASE_FACTOR, easeFactor + 0.15);
    repetitions += 1;
  }

  return {
    easeFactor,
    intervalDays,
    repetitions,
    lastReviewed: reviewedAt.toISOString(),
    nextReview: toDateOnly(addDays(reviewedAt, intervalDays))
  };
}

export function isMastered(state: Pick<CardState, "intervalDays">) {
  return state.intervalDays >= 21;
}
