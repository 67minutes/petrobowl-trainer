// Shared client/server view models for the gamification layer.

import type { CosmeticSlot } from "@/types/database";

export type CompletedQuest = {
  key: string;
  label: string;
  reward_xp: number;
  reward_coins: number;
};

export type UnlockedAchievement = {
  key: string;
  label: string;
  reward_coins: number;
};

// Returned from POST /api/drill/review alongside the SRS result. Drives the client FX.
export type AwardSummary = {
  xpGained: number;
  coinsGained: number;
  totalXp: number;
  coins: number;
  level: number;
  leveledUp: boolean;
  xpIntoLevel: number;
  xpForNextLevel: number;
  combo: number;
  streak: number;
  streakFreezes: number;
  masteryCrossed: boolean;
  awardedFreeze: boolean;
  doubleXp: boolean;
  questsCompleted: CompletedQuest[];
  achievementsUnlocked: UnlockedAchievement[];
};

export type GamificationState = {
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  coins: number;
  currentStreak: number;
  longestStreak: number;
  streakFreezes: number;
  combo: number;
  totalReviews: number;
  totalMastered: number;
};

export type QuestView = {
  key: string;
  label: string;
  description: string;
  target: number;
  progress: number;
  reward_xp: number;
  reward_coins: number;
  completed: boolean;
};

export type AchievementView = {
  key: string;
  label: string;
  description: string;
  reward_coins: number;
  unlocked: boolean;
  unlockedAt: string | null;
};

export type CosmeticView = {
  key: string;
  slot: CosmeticSlot;
  name: string;
  description: string;
  owned: boolean;
  equipped: boolean;
  unlockedByProgress: boolean;
  coinCost: number | null;
};

export type TeamChallengeView = {
  key: string;
  label: string;
  description: string;
  target: number;
  progress: number;
  reward_xp: number;
  reward_coins: number;
  completed: boolean;
  weekStart: string;
};

export type EquippedCosmetics = Record<CosmeticSlot, string | null>;

export type GamificationMe = {
  state: GamificationState;
  quests: QuestView[];
  achievements: AchievementView[];
  cosmetics: CosmeticView[];
  challenge: TeamChallengeView | null;
  equipped: EquippedCosmetics;
};

export type LeaderboardEntry = {
  playerId: string;
  name: string;
  isSelf: boolean;
  level: number;
  xp: number;
  currentStreak: number;
  weekReviews: number;
  weekAccuracy: number;
  equippedBadge: string | null;
};

export type Leaderboard = {
  entries: LeaderboardEntry[];
};
