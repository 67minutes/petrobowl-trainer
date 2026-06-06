"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useDashboardData } from "@/components/dashboard/use-dashboard-data";
import { ProgressBar } from "@/components/progress-bar";
import { StatRow } from "@/components/stat-row";

export function HomeContent() {
  const { session } = useAuth();
  const { data, loading, error } = useDashboardData();

  if (!session) {
    return (
      <section className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">Hello.</h2>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">Hello.</h2>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">Hello.</h2>
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
        <h2 className="text-lg font-semibold text-ink-900">Hello.</h2>
        <StatRow label="Due today" value={String(teamDue)} tone="warn" />
        <StatRow label="Reviewed today" value={String(reviewedToday)} tone="good" />
        <StatRow label="Unowned terms" value={data.unownedQuestions.toLocaleString()} />
      </section>
    </div>
  );
}
