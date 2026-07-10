// Loads the full gamification snapshot for one player (state + quests + achievements + cosmetics +
// weekly challenge). Read-only: quests for today are derived deterministically so no write happens
// on a GET — the same pick is what award-server persists when the player actually drills.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AchievementView,
  CosmeticView,
  EquippedCosmetics,
  GamificationMe,
  QuestView,
  TeamChallengeView
} from "@/types/gamification";
import type { CosmeticSlot } from "@/types/database";
import { levelForXp } from "@/lib/gamification/leveling";
import { dayNumberFromDate, pickDailyQuests, seedFromPlayerId } from "@/lib/gamification/quests";
import { ACHIEVEMENT_CATALOG } from "@/lib/gamification/achievements";
import {
  COSMETIC_CATALOG,
  cosmeticCoinCost,
  DEFAULT_COSMETICS,
  isUnlockedByProgress
} from "@/lib/gamification/cosmetics-catalog";
import { challengeDef, pickWeeklyChallenge, weekStartOf } from "@/lib/gamification/team-challenges";

const MASTERY_THRESHOLD = 21;
const COSMETIC_SLOTS: CosmeticSlot[] = ["theme", "sound", "mascot", "frame", "badge"];

export async function loadGamificationMe(
  supabase: SupabaseClient,
  playerId: string,
  teamId: string,
  today = new Date().toISOString().slice(0, 10)
): Promise<GamificationMe> {
  const [
    { data: gamification },
    { count: totalReviews },
    { count: totalMastered },
    { data: questRows },
    { data: achievementRows },
    { data: cosmeticRows }
  ] = await Promise.all([
    supabase.from("player_gamification").select("*").eq("player_id", playerId).maybeSingle(),
    supabase.from("drill_responses").select("*", { count: "exact", head: true }).eq("player_id", playerId),
    supabase
      .from("card_progress")
      .select("*", { count: "exact", head: true })
      .eq("player_id", playerId)
      .gte("interval_days", MASTERY_THRESHOLD),
    supabase.from("daily_quests").select("*").eq("player_id", playerId).eq("quest_date", today),
    supabase.from("player_achievements").select("achievement_key, unlocked_at").eq("player_id", playerId),
    supabase.from("player_cosmetics").select("cosmetic_key, slot, equipped").eq("player_id", playerId)
  ]);

  const xp = gamification?.xp ?? 0;
  const levelInfo = levelForXp(xp);

  const state = {
    xp,
    level: gamification?.level ?? levelInfo.level,
    xpIntoLevel: levelInfo.xpIntoLevel,
    xpForNextLevel: levelInfo.xpForNextLevel,
    coins: gamification?.coins ?? 0,
    currentStreak: gamification?.current_streak ?? 0,
    longestStreak: gamification?.longest_streak ?? 0,
    streakFreezes: gamification?.streak_freezes ?? 0,
    combo: gamification?.current_combo ?? 0,
    totalReviews: totalReviews ?? 0,
    totalMastered: totalMastered ?? 0
  };

  // Quests: deterministic pick for today, merged with any persisted progress.
  const persisted = new Map(
    ((questRows ?? []) as {
      quest_key: string;
      progress: number;
      completed_at: string | null;
    }[]).map((row) => [row.quest_key, row])
  );
  const quests: QuestView[] = pickDailyQuests(dayNumberFromDate(today), seedFromPlayerId(playerId)).map(
    (def) => {
      const row = persisted.get(def.key);
      return {
        key: def.key,
        label: def.label,
        description: def.description,
        target: def.target,
        progress: row?.progress ?? 0,
        reward_xp: def.reward_xp,
        reward_coins: def.reward_coins,
        completed: Boolean(row?.completed_at)
      };
    }
  );

  // Achievements.
  const unlockedMap = new Map(
    ((achievementRows ?? []) as { achievement_key: string; unlocked_at: string }[]).map((row) => [
      row.achievement_key,
      row.unlocked_at
    ])
  );
  const unlockedKeys = new Set(unlockedMap.keys());
  const achievements: AchievementView[] = ACHIEVEMENT_CATALOG.map((def) => ({
    key: def.key,
    label: def.label,
    description: def.description,
    reward_coins: def.reward_coins,
    unlocked: unlockedMap.has(def.key),
    unlockedAt: unlockedMap.get(def.key) ?? null
  }));

  // Cosmetics.
  const owned = new Map(
    ((cosmeticRows ?? []) as { cosmetic_key: string; slot: string; equipped: boolean }[]).map((row) => [
      row.cosmetic_key,
      row
    ])
  );
  const cosmetics: CosmeticView[] = COSMETIC_CATALOG.map((def) => {
    const ownedRow = owned.get(def.key);
    const isOwned = Boolean(ownedRow) || DEFAULT_COSMETICS.includes(def.key);
    return {
      key: def.key,
      slot: def.slot,
      name: def.name,
      description: def.description,
      owned: isOwned,
      equipped: Boolean(ownedRow?.equipped),
      unlockedByProgress: isUnlockedByProgress(def, { level: state.level, achievements: unlockedKeys }),
      coinCost: cosmeticCoinCost(def)
    };
  });

  // Equipped map — fall back to the default cosmetic for any slot with nothing equipped.
  const equipped = COSMETIC_SLOTS.reduce((acc, slot) => {
    const equippedRow = ((cosmeticRows ?? []) as { cosmetic_key: string; slot: string; equipped: boolean }[]).find(
      (row) => row.slot === slot && row.equipped
    );
    const fallback = DEFAULT_COSMETICS.find((key) => COSMETIC_CATALOG.find((c) => c.key === key)?.slot === slot);
    acc[slot] = equippedRow?.cosmetic_key ?? fallback ?? null;
    return acc;
  }, {} as EquippedCosmetics);

  // Weekly team challenge.
  const weekStart = weekStartOf(today);
  const def = pickWeeklyChallenge(weekStart);
  const { data: challengeRow } = await supabase
    .from("team_challenges")
    .select("*")
    .eq("team_id", teamId)
    .eq("week_start", weekStart)
    .eq("challenge_key", def.key)
    .maybeSingle();
  const resolvedDef = challengeRow ? challengeDef(challengeRow.challenge_key) ?? def : def;
  const challenge: TeamChallengeView = {
    key: resolvedDef.key,
    label: resolvedDef.label,
    description: resolvedDef.description,
    target: challengeRow?.target ?? resolvedDef.target,
    progress: challengeRow?.progress ?? 0,
    reward_xp: challengeRow?.reward_xp ?? resolvedDef.reward_xp,
    reward_coins: challengeRow?.reward_coins ?? resolvedDef.reward_coins,
    completed: Boolean(challengeRow?.completed_at),
    weekStart
  };

  return { state, quests, achievements, cosmetics, challenge, equipped };
}
