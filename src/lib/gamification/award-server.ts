// Server-authoritative gamification award for a single drill review.
//
// Called from POST /api/drill/review AFTER the SRS write (card_progress + drill_responses) has
// already happened. It only reads the SRS tables and writes the gamification tables — it never
// changes scheduling. Failures are swallowed by the caller so a game hiccup can't block a review.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReviewRating } from "@/lib/sm2";
import type { AwardSummary, CompletedQuest, UnlockedAchievement } from "@/types/gamification";
import { levelForXp } from "@/lib/gamification/leveling";
import { xpForReview } from "@/lib/gamification/xp";
import { applyStreak } from "@/lib/gamification/streak";
import {
  dayNumberFromDate,
  pickDailyQuests,
  questDef,
  questProgress,
  seedFromPlayerId,
  type DailyAggregate
} from "@/lib/gamification/quests";
import { achievementDef, checkAchievements } from "@/lib/gamification/achievements";
import { pickWeeklyChallenge, weekStartOf } from "@/lib/gamification/team-challenges";

export type ReviewAwardInput = {
  playerId: string;
  teamId: string;
  rating: ReviewRating;
  priorIntervalDays: number;
  newIntervalDays: number;
  wasNew: boolean;
  reviewedAtISO: string;
};

const MASTERY_THRESHOLD = 21;

function topicIdFromEmbed(value: unknown): string | null {
  if (!value) return null;
  const row = Array.isArray(value) ? value[0] : value;
  if (row && typeof row === "object" && "topic_id" in row) {
    const topicId = (row as { topic_id?: unknown }).topic_id;
    return typeof topicId === "string" ? topicId : null;
  }
  return null;
}

export async function awardForReview(
  supabase: SupabaseClient,
  input: ReviewAwardInput
): Promise<AwardSummary> {
  const today = input.reviewedAtISO.slice(0, 10);
  const dayStart = `${today}T00:00:00.000Z`;
  const correct = input.rating !== "again";

  // --- Load current game state (default row if none yet) ---
  const { data: existing } = await supabase
    .from("player_gamification")
    .select("*")
    .eq("player_id", input.playerId)
    .maybeSingle();

  const prev = {
    xp: existing?.xp ?? 0,
    level: existing?.level ?? 1,
    coins: existing?.coins ?? 0,
    current_streak: existing?.current_streak ?? 0,
    longest_streak: existing?.longest_streak ?? 0,
    last_active_date: existing?.last_active_date ?? null,
    current_combo: existing?.current_combo ?? 0,
    streak_freezes: existing?.streak_freezes ?? 0
  };

  const combo = correct ? prev.current_combo + 1 : 0;
  const streak = applyStreak(
    {
      current_streak: prev.current_streak,
      longest_streak: prev.longest_streak,
      last_active_date: prev.last_active_date,
      streak_freezes: prev.streak_freezes
    },
    today
  );
  const firstReviewOfDay = streak.incremented;
  const masteryCrossed =
    input.priorIntervalDays < MASTERY_THRESHOLD && input.newIntervalDays >= MASTERY_THRESHOLD;
  const weekendDay = new Date(dayStart).getUTCDay();
  const doubleXp = weekendDay === 0 || weekendDay === 6;

  const reviewReward = xpForReview({
    rating: input.rating,
    combo,
    wasNew: input.wasNew,
    masteryCrossed,
    firstReviewOfDay,
    doubleXp
  });

  // --- Today's aggregates for quest progress ---
  const { data: todayRows } = await supabase
    .from("drill_responses")
    .select("correct, questions(topic_id)")
    .eq("player_id", input.playerId)
    .gte("reviewed_at", dayStart)
    .order("reviewed_at", { ascending: true });

  const rows = (todayRows ?? []) as { correct: boolean; questions: unknown }[];
  let run = 0;
  let maxCombo = 0;
  const topics = new Set<string>();
  let correctToday = 0;
  for (const row of rows) {
    if (row.correct) {
      run += 1;
      maxCombo = Math.max(maxCombo, run);
      correctToday += 1;
    } else {
      run = 0;
    }
    const topicId = topicIdFromEmbed(row.questions);
    if (topicId) topics.add(topicId);
  }
  const aggregate: DailyAggregate = {
    reviews: rows.length,
    correct: correctToday,
    distinctTopics: topics.size,
    maxCombo
  };

  // --- Daily quests: generate if missing, then advance ---
  const questsCompleted = await advanceQuests(supabase, input.playerId, today, aggregate);
  const questXp = questsCompleted.reduce((sum, q) => sum + q.reward_xp, 0);
  const questCoins = questsCompleted.reduce((sum, q) => sum + q.reward_coins, 0);

  // --- Weekly team challenge ---
  const challenge = await advanceTeamChallenge(supabase, input.teamId, input.playerId, today, correct);

  // --- Totals + level ---
  const totalXp = prev.xp + reviewReward.xp + questXp + challenge.rewardXp;
  let totalCoins = prev.coins + reviewReward.coins + questCoins + challenge.rewardCoins;
  const levelInfo = levelForXp(totalXp);
  const leveledUp = levelInfo.level > prev.level;

  // --- Achievements (depend on final level; grant coins only) ---
  const [{ count: totalReviews }, { count: totalMastered }, { data: unlockedRows }] = await Promise.all([
    supabase
      .from("drill_responses")
      .select("*", { count: "exact", head: true })
      .eq("player_id", input.playerId),
    supabase
      .from("card_progress")
      .select("*", { count: "exact", head: true })
      .eq("player_id", input.playerId)
      .gte("interval_days", MASTERY_THRESHOLD),
    supabase.from("player_achievements").select("achievement_key").eq("player_id", input.playerId)
  ]);

  const alreadyUnlocked = new Set<string>(
    ((unlockedRows ?? []) as { achievement_key: string }[]).map((r) => r.achievement_key)
  );
  const newKeys = checkAchievements(
    {
      level: levelInfo.level,
      currentStreak: streak.current_streak,
      totalReviews: totalReviews ?? 0,
      totalMastered: totalMastered ?? 0,
      combo
    },
    alreadyUnlocked
  );

  const achievementsUnlocked: UnlockedAchievement[] = [];
  if (newKeys.length > 0) {
    await supabase
      .from("player_achievements")
      .insert(newKeys.map((key) => ({ player_id: input.playerId, achievement_key: key })));
    for (const key of newKeys) {
      const def = achievementDef(key);
      if (def) {
        totalCoins += def.reward_coins;
        achievementsUnlocked.push({ key, label: def.label, reward_coins: def.reward_coins });
      }
    }
  }

  // --- Persist game state ---
  await supabase.from("player_gamification").upsert(
    {
      player_id: input.playerId,
      xp: totalXp,
      level: levelInfo.level,
      coins: totalCoins,
      current_streak: streak.current_streak,
      longest_streak: streak.longest_streak,
      last_active_date: streak.last_active_date,
      current_combo: combo,
      streak_freezes: streak.streak_freezes,
      updated_at: new Date().toISOString()
    },
    { onConflict: "player_id" }
  );

  return {
    xpGained: totalXp - prev.xp,
    coinsGained: totalCoins - prev.coins,
    totalXp,
    coins: totalCoins,
    level: levelInfo.level,
    leveledUp,
    xpIntoLevel: levelInfo.xpIntoLevel,
    xpForNextLevel: levelInfo.xpForNextLevel,
    combo,
    streak: streak.current_streak,
    streakFreezes: streak.streak_freezes,
    masteryCrossed,
    awardedFreeze: streak.awardedFreeze,
    doubleXp,
    questsCompleted,
    achievementsUnlocked
  };
}

async function advanceQuests(
  supabase: SupabaseClient,
  playerId: string,
  today: string,
  aggregate: DailyAggregate
): Promise<CompletedQuest[]> {
  let { data: questRows } = await supabase
    .from("daily_quests")
    .select("*")
    .eq("player_id", playerId)
    .eq("quest_date", today);

  if (!questRows || questRows.length === 0) {
    const generated = pickDailyQuests(dayNumberFromDate(today), seedFromPlayerId(playerId)).map((quest) => ({
      player_id: playerId,
      quest_date: today,
      quest_key: quest.key,
      target: quest.target,
      progress: 0,
      reward_xp: quest.reward_xp,
      reward_coins: quest.reward_coins
    }));
    await supabase
      .from("daily_quests")
      .upsert(generated, { onConflict: "player_id,quest_date,quest_key", ignoreDuplicates: true });
    const reloaded = await supabase
      .from("daily_quests")
      .select("*")
      .eq("player_id", playerId)
      .eq("quest_date", today);
    questRows = reloaded.data;
  }

  const completed: CompletedQuest[] = [];
  const nowIso = new Date().toISOString();

  for (const quest of (questRows ?? []) as {
    id: string;
    quest_key: string;
    target: number;
    progress: number;
    reward_xp: number;
    reward_coins: number;
    completed_at: string | null;
  }[]) {
    const def = questDef(quest.quest_key as never);
    if (!def) continue;
    const nextProgress = Math.max(quest.progress, questProgress(def.key, aggregate));
    const completesNow = quest.completed_at === null && nextProgress >= quest.target;

    if (nextProgress !== quest.progress || completesNow) {
      await supabase
        .from("daily_quests")
        .update({
          progress: nextProgress,
          completed_at: completesNow ? nowIso : quest.completed_at
        })
        .eq("id", quest.id);
    }

    if (completesNow) {
      completed.push({
        key: quest.quest_key,
        label: def.label,
        reward_xp: quest.reward_xp,
        reward_coins: quest.reward_coins
      });
    }
  }

  return completed;
}

async function advanceTeamChallenge(
  supabase: SupabaseClient,
  teamId: string,
  playerId: string,
  today: string,
  correct: boolean
): Promise<{ rewardXp: number; rewardCoins: number }> {
  const weekStart = weekStartOf(today);
  const def = pickWeeklyChallenge(weekStart);
  const delta = def.metric === "correct" ? (correct ? 1 : 0) : 1;

  const { data: row } = await supabase
    .from("team_challenges")
    .select("*")
    .eq("team_id", teamId)
    .eq("week_start", weekStart)
    .eq("challenge_key", def.key)
    .maybeSingle();

  const nowIso = new Date().toISOString();

  if (!row) {
    const progress = delta;
    const completed = progress >= def.target;
    const rewarded = completed ? [playerId] : [];
    await supabase.from("team_challenges").upsert(
      {
        team_id: teamId,
        week_start: weekStart,
        challenge_key: def.key,
        target: def.target,
        reward_xp: def.reward_xp,
        reward_coins: def.reward_coins,
        progress,
        completed_at: completed ? nowIso : null,
        rewarded_player_ids: rewarded
      },
      { onConflict: "team_id,week_start,challenge_key", ignoreDuplicates: true }
    );
    return completed
      ? { rewardXp: def.reward_xp, rewardCoins: def.reward_coins }
      : { rewardXp: 0, rewardCoins: 0 };
  }

  const nextProgress = row.progress + delta;
  const rewardedIds: string[] = row.rewarded_player_ids ?? [];
  const isComplete = nextProgress >= row.target;
  const shouldReward = isComplete && !rewardedIds.includes(playerId);

  await supabase
    .from("team_challenges")
    .update({
      progress: nextProgress,
      completed_at: row.completed_at ?? (isComplete ? nowIso : null),
      rewarded_player_ids: shouldReward ? [...rewardedIds, playerId] : rewardedIds
    })
    .eq("id", row.id);

  return shouldReward
    ? { rewardXp: row.reward_xp, rewardCoins: row.reward_coins }
    : { rewardXp: 0, rewardCoins: 0 };
}
