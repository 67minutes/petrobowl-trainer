// Milestone achievements. Unlock-once; checked server-side after each review.

export type AchievementDef = {
  key: string;
  label: string;
  description: string;
  reward_coins: number;
};

export const ACHIEVEMENT_CATALOG: AchievementDef[] = [
  { key: "first_drill", label: "First Steps", description: "Complete your first review", reward_coins: 10 },
  { key: "streak_3", label: "Getting Warm", description: "3-day streak", reward_coins: 15 },
  { key: "streak_7", label: "Week Warrior", description: "7-day streak", reward_coins: 30 },
  { key: "streak_14", label: "Fortnight", description: "14-day streak", reward_coins: 50 },
  { key: "streak_30", label: "Unstoppable", description: "30-day streak", reward_coins: 100 },
  { key: "streak_100", label: "Centurion", description: "100-day streak", reward_coins: 300 },
  { key: "level_5", label: "Rising", description: "Reach level 5", reward_coins: 20 },
  { key: "level_10", label: "Seasoned", description: "Reach level 10", reward_coins: 40 },
  { key: "level_25", label: "Veteran", description: "Reach level 25", reward_coins: 100 },
  { key: "level_50", label: "Elite", description: "Reach level 50", reward_coins: 250 },
  { key: "mastered_25", label: "Foundation", description: "Master 25 cards", reward_coins: 20 },
  { key: "mastered_100", label: "Scholar", description: "Master 100 cards", reward_coins: 50 },
  { key: "mastered_250", label: "Expert", description: "Master 250 cards", reward_coins: 120 },
  { key: "mastered_500", label: "Master", description: "Master 500 cards", reward_coins: 300 },
  { key: "reviews_100", label: "Committed", description: "100 total reviews", reward_coins: 20 },
  { key: "reviews_500", label: "Dedicated", description: "500 total reviews", reward_coins: 60 },
  { key: "reviews_2500", label: "Relentless", description: "2,500 total reviews", reward_coins: 200 },
  { key: "combo_25", label: "Combo King", description: "Reach a 25-answer combo", reward_coins: 40 }
];

const CATALOG_BY_KEY = new Map(ACHIEVEMENT_CATALOG.map((a) => [a.key, a]));

export function achievementDef(key: string): AchievementDef | undefined {
  return CATALOG_BY_KEY.get(key);
}

export type AchievementContext = {
  level: number;
  currentStreak: number;
  totalReviews: number;
  totalMastered: number;
  combo: number; // combo reached on this review
};

// Returns keys newly satisfied by ctx that are not already unlocked, in catalog order.
export function checkAchievements(ctx: AchievementContext, alreadyUnlocked: Set<string>): string[] {
  const satisfied = new Set<string>();

  if (ctx.totalReviews >= 1) satisfied.add("first_drill");

  for (const [key, threshold] of [
    ["streak_3", 3],
    ["streak_7", 7],
    ["streak_14", 14],
    ["streak_30", 30],
    ["streak_100", 100]
  ] as const) {
    if (ctx.currentStreak >= threshold) satisfied.add(key);
  }

  for (const [key, threshold] of [
    ["level_5", 5],
    ["level_10", 10],
    ["level_25", 25],
    ["level_50", 50]
  ] as const) {
    if (ctx.level >= threshold) satisfied.add(key);
  }

  for (const [key, threshold] of [
    ["mastered_25", 25],
    ["mastered_100", 100],
    ["mastered_250", 250],
    ["mastered_500", 500]
  ] as const) {
    if (ctx.totalMastered >= threshold) satisfied.add(key);
  }

  for (const [key, threshold] of [
    ["reviews_100", 100],
    ["reviews_500", 500],
    ["reviews_2500", 2500]
  ] as const) {
    if (ctx.totalReviews >= threshold) satisfied.add(key);
  }

  if (ctx.combo >= 25) satisfied.add("combo_25");

  return ACHIEVEMENT_CATALOG.map((a) => a.key).filter(
    (key) => satisfied.has(key) && !alreadyUnlocked.has(key)
  );
}
