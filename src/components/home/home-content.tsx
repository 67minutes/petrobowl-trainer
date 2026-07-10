"use client";

import Link from "next/link";
import { Coins, Flame, Play, Sparkles, Trophy } from "lucide-react";
import { clsx } from "clsx";
import { useAuth } from "@/components/auth/auth-provider";
import { useGamification } from "@/components/gamification/gamification-provider";
import { useDashboardData } from "@/components/dashboard/use-dashboard-data";
import { ProgressBar } from "@/components/progress-bar";
import { StatRow } from "@/components/stat-row";

function PersonalStrip() {
  const { me } = useGamification();
  if (!me) return null;

  const { level, xpIntoLevel, xpForNextLevel, coins, currentStreak } = me.state;
  const pct = xpForNextLevel > 0 ? Math.min(100, (xpIntoLevel / xpForNextLevel) * 100) : 0;
  const topQuests = me.quests.slice(0, 3);

  return (
    <section className="surface rounded p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-ink-900 text-lg font-extrabold text-white shadow-glow">
            {level}
          </span>
          <div>
            <div className="h-2 w-40 overflow-hidden rounded-full bg-ink-200">
              <div className="xp-fill animate-shimmer h-full rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-2 flex items-center gap-4 text-sm font-semibold">
              <span className="flex items-center gap-1 text-flame-600">
                <Flame aria-hidden className="h-4 w-4" />
                {currentStreak}
              </span>
              <span className="flex items-center gap-1 text-gold-600">
                <Coins aria-hidden className="h-4 w-4" />
                {coins}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
          {topQuests.map((quest) => (
            <span
              key={quest.key}
              className={clsx(
                "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium",
                quest.completed
                  ? "border-combo-500 bg-combo-500/10 text-combo-600"
                  : "border-ink-200 bg-white text-ink-600"
              )}
            >
              <Sparkles aria-hidden className="h-3 w-3" />
              {Math.min(quest.progress, quest.target)}/{quest.target} {quest.label}
            </span>
          ))}
          <Link
            href="/rewards"
            className="focus-ring inline-flex items-center gap-1 rounded-full bg-gold-500 px-3 py-1 text-xs font-bold text-white transition hover:bg-gold-600"
          >
            <Trophy aria-hidden className="h-3 w-3" />
            Rewards
          </Link>
        </div>
      </div>
    </section>
  );
}

export function HomeContent() {
  const { session } = useAuth();
  const { data, loading, error } = useDashboardData();

  if (!session) {
    return (
      <section className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">Sign in to start training</h2>
        <p className="mt-2 text-sm text-ink-500">Your drill queue and team snapshot appear after authentication.</p>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">Loading team snapshot</h2>
        <p className="mt-2 text-sm text-ink-500">Checking due reviews and team mastery.</p>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">Home data unavailable</h2>
        <p className="mt-3 text-sm text-red-600">{error ?? "Dashboard unavailable."}</p>
      </section>
    );
  }

  const teamAssigned = data.players.reduce((sum, player) => sum + player.assignedQuestions, 0);
  const teamMastered = data.players.reduce((sum, player) => sum + player.mastered, 0);
  const teamDue = data.players.reduce((sum, player) => sum + player.dueToday, 0);
  const reviewedToday = data.players.reduce((sum, player) => sum + player.reviewedToday, 0);
  const teamMastery = teamAssigned === 0 ? 0 : (teamMastered / teamAssigned) * 100;

  return (
    <div className="space-y-5">
      <PersonalStrip />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
      <section className="surface rounded p-5">
        <div className="flex flex-col justify-between gap-4 border-b border-ink-200 pb-5 sm:flex-row sm:items-center">
          <h2 className="text-lg font-semibold text-ink-900">{data.teamName}</h2>
          <Link
            href="/drill"
            className="focus-ring inline-flex items-center gap-2 rounded bg-petrol-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-petrol-500"
          >
            <Play aria-hidden className="h-4 w-4" />
            Start Drill
          </Link>
        </div>

        <div className="mt-5">
          <ProgressBar value={teamMastery} label="Team" />
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          {data.players.map((player) => (
            <div key={player.id} className="rounded border border-ink-200 bg-white p-4">
              <p className="text-sm font-semibold text-ink-900">{player.name}</p>
              <p className="mt-2 text-2xl font-semibold text-ink-900">{player.dueToday}</p>
              <p className="text-xs text-ink-500">Due today</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded border border-ink-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-ink-900">Team queue</h2>
        <StatRow label="Due today" value={String(teamDue)} tone="warn" />
        <StatRow label="Reviewed today" value={String(reviewedToday)} tone="good" />
        <StatRow label="Unowned terms" value={data.unownedQuestions.toLocaleString()} />
      </section>
      </div>
    </div>
  );
}
