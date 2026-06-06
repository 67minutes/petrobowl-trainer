import Link from "next/link";
import { Play } from "lucide-react";
import { AuthGreeting } from "@/components/auth/auth-greeting";
import { AuthPanel } from "@/components/auth/auth-panel";
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
      eyebrow="Hello"
      title={<AuthGreeting />}
      aside={<AuthPanel />}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
        <section className="surface rounded p-5">
          <div className="flex flex-col justify-between gap-4 border-b border-ink-200 pb-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold text-ink-900">{demoTeam.name}</h2>
              <p className="mt-1 text-sm text-ink-500">Good to see you.</p>
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
            <ProgressBar value={(teamMastered / teamAssigned) * 100} label="Team" />
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
          <StatRow label="Due reviews" value="184" tone="warn" />
          <StatRow label="Reviewed" value="102" tone="good" />
          <StatRow label="Unowned terms" value="962" />
        </section>
      </div>
    </AppShell>
  );
}
