import Link from "next/link";
import { ArrowRight, LockKeyhole, Play } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ProgressBar } from "@/components/progress-bar";
import { StatRow } from "@/components/stat-row";
import { demoPlayers, demoTeam } from "@/lib/demo-data";

export default function Home() {
  const teamMastered = demoPlayers.reduce((sum, player) => sum + player.mastered, 0);
  const teamAssigned = demoPlayers.reduce((sum, player) => sum + player.assignedQuestions, 0);

  return (
    <AppShell
      active="/"
      eyebrow="Training cockpit"
      title="Solo mastery first, buzzer speed second."
      subtitle="The first screen tracks what matters today: due reviews, topic ownership, and readiness for the next live session."
      aside={
        <div className="surface rounded p-5">
          <div className="flex items-center gap-3">
            <LockKeyhole aria-hidden className="h-5 w-5 text-petrol-600" />
            <div>
              <h2 className="text-sm font-semibold text-ink-900">Supabase Auth</h2>
              <p className="mt-1 text-xs text-ink-500">Email login connects users to player rows.</p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            <input
              aria-label="Email"
              placeholder="email@speitb.org"
              className="focus-ring w-full rounded border border-ink-200 bg-white px-3 py-2 text-sm"
            />
            <button
              type="button"
              className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded bg-ink-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-700"
            >
              Continue
              <ArrowRight aria-hidden className="h-4 w-4" />
            </button>
          </div>
        </div>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
        <section className="surface rounded p-5">
          <div className="flex flex-col justify-between gap-4 border-b border-ink-200 pb-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold text-ink-900">{demoTeam.name}</h2>
              <p className="mt-1 text-sm text-ink-500">
                {demoTeam.totalQuestions.toLocaleString()} imported terms, {demoTeam.dailyNewCardLimit} new cards per day.
              </p>
            </div>
            <Link
              href="/drill"
              className="focus-ring inline-flex items-center gap-2 rounded bg-petrol-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-petrol-500"
            >
              <Play aria-hidden className="h-4 w-4" />
              Start Drill
            </Link>
          </div>

          <div className="mt-5">
            <ProgressBar value={(teamMastered / teamAssigned) * 100} label="Team readiness" />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            {demoPlayers.map((player) => (
              <div key={player.name} className="rounded border border-ink-200 bg-white p-4">
                <p className="text-sm font-semibold text-ink-900">{player.name}</p>
                <p className="mt-2 text-2xl font-semibold text-ink-900">{player.dueToday}</p>
                <p className="text-xs text-ink-500">cards due</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded border border-ink-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-ink-900">Today</h2>
          <StatRow label="Due reviews" value="184" detail="Prioritized before new cards" tone="warn" />
          <StatRow label="Reviewed" value="102" detail="Logged across all players" tone="good" />
          <StatRow label="Unowned terms" value="962" detail="Renewables IEA + EIA pool" />
        </section>
      </div>
    </AppShell>
  );
}
