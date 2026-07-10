import { NextResponse } from "next/server";
import { resolvePlayer } from "@/lib/gamification/route-auth";
import { weekStartOf } from "@/lib/gamification/team-challenges";
import type { Leaderboard, LeaderboardEntry } from "@/types/gamification";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const resolved = await resolvePlayer(request);
  if (resolved instanceof NextResponse) {
    return resolved;
  }

  const { supabase, player } = resolved;
  const weekStartIso = `${weekStartOf(new Date().toISOString().slice(0, 10))}T00:00:00.000Z`;

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, name")
    .eq("team_id", player.team_id)
    .eq("is_player", true)
    .order("name");

  if (playersError || !players) {
    return NextResponse.json(
      { error: playersError?.message ?? "Could not load players." },
      { status: 500 }
    );
  }

  const ids = (players as { id: string; name: string }[]).map((p) => p.id);
  if (ids.length === 0) {
    return NextResponse.json({ data: { entries: [] } satisfies Leaderboard });
  }

  const [{ data: gami }, { data: badges }, weekStats] = await Promise.all([
    supabase.from("player_gamification").select("*").in("player_id", ids),
    supabase
      .from("player_cosmetics")
      .select("player_id, cosmetic_key")
      .eq("slot", "badge")
      .eq("equipped", true)
      .in("player_id", ids),
    Promise.all(
      ids.map(async (id) => {
        const [{ count: reviews }, { count: correct }] = await Promise.all([
          supabase
            .from("drill_responses")
            .select("*", { count: "exact", head: true })
            .eq("player_id", id)
            .gte("reviewed_at", weekStartIso),
          supabase
            .from("drill_responses")
            .select("*", { count: "exact", head: true })
            .eq("player_id", id)
            .eq("correct", true)
            .gte("reviewed_at", weekStartIso)
        ]);
        return { id, reviews: reviews ?? 0, correct: correct ?? 0 };
      })
    )
  ]);

  const gamiById = new Map(
    ((gami ?? []) as { player_id: string; xp: number; level: number; current_streak: number }[]).map(
      (row) => [row.player_id, row]
    )
  );
  const badgeById = new Map(
    ((badges ?? []) as { player_id: string; cosmetic_key: string }[]).map((row) => [
      row.player_id,
      row.cosmetic_key
    ])
  );
  const statsById = new Map(weekStats.map((s) => [s.id, s]));

  const entries: LeaderboardEntry[] = (players as { id: string; name: string }[])
    .map((p) => {
      const g = gamiById.get(p.id);
      const stats = statsById.get(p.id);
      const reviews = stats?.reviews ?? 0;
      const correct = stats?.correct ?? 0;
      return {
        playerId: p.id,
        name: p.name,
        isSelf: p.id === player.id,
        level: g?.level ?? 1,
        xp: g?.xp ?? 0,
        currentStreak: g?.current_streak ?? 0,
        weekReviews: reviews,
        weekAccuracy: reviews === 0 ? 0 : correct / reviews,
        equippedBadge: badgeById.get(p.id) ?? null
      };
    })
    .sort((a, b) => b.xp - a.xp || b.currentStreak - a.currentStreak || b.weekReviews - a.weekReviews);

  return NextResponse.json({ data: { entries } satisfies Leaderboard });
}
