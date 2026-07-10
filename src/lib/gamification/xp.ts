// XP + coin reward for a single review. Pure; the caller (award-server) supplies context
// derived from the review that was already written to drill_responses.

import type { ReviewRating } from "@/lib/sm2";

export type ReviewXpContext = {
  rating: ReviewRating;
  combo: number; // combo count AFTER this review (consecutive corrects incl. this one); 0 on "again"
  wasNew: boolean; // first time this card was seen
  masteryCrossed: boolean; // interval crossed into >= 21 days on this review
  firstReviewOfDay: boolean;
  doubleXp: boolean; // an active double-XP bonus/quest
};

export type XpReward = {
  xp: number;
  coins: number;
};

export const BASE_XP: Record<ReviewRating, number> = {
  again: 2,
  hard: 8,
  good: 10,
  easy: 10
};

export const NEW_CARD_BONUS = 5;
export const MASTERY_BONUS = 25;
export const FIRST_OF_DAY_BONUS = 20;

export function comboMultiplier(combo: number): number {
  if (combo >= 20) return 2;
  if (combo >= 10) return 1.5;
  if (combo >= 5) return 1.25;
  return 1;
}

export function xpForReview(ctx: ReviewXpContext): XpReward {
  const correct = ctx.rating !== "again";
  const multiplier = correct ? comboMultiplier(ctx.combo) : 1;
  let xp = Math.round(BASE_XP[ctx.rating] * multiplier);

  if (ctx.wasNew) xp += NEW_CARD_BONUS;
  if (ctx.masteryCrossed) xp += MASTERY_BONUS;
  if (ctx.firstReviewOfDay) xp += FIRST_OF_DAY_BONUS;
  if (ctx.doubleXp) xp *= 2;

  const coins = Math.max(correct ? 1 : 0, Math.floor(xp / 10));
  return { xp, coins };
}
