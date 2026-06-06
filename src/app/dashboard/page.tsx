import { ActivityHeatmap } from "@/components/activity-heatmap";
import { AuthGreeting } from "@/components/auth/auth-greeting";
import { RequireAuth } from "@/components/auth/require-auth";
import { AppShell } from "@/components/app-shell";
import { PlayerTable } from "@/components/player-table";
import { ProgressBar } from "@/components/progress-bar";
import { StatRow } from "@/components/stat-row";
import { demoActivity, demoPlayers, demoWeakSpots } from "@/lib/demo-data";

export default function DashboardPage() {
  const activePlayer = demoPlayers[0];
  const masteredPercent = (activePlayer.mastered / activePlayer.assignedQuestions) * 100;

  return (
    <AppShell
      active="/dashboard"
      eyebrow="Hello"
      title={<AuthGreeting />}
      aside={
        <div className="rounded border border-ink-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-ink-900">Weak spots</h2>
          <div className="mt-3 divide-y divide-ink-200">
            {demoWeakSpots.map((spot) => (
              <div key={spot.term} className="py-3">
                <p className="text-sm font-medium text-ink-900">{spot.term}</p>
                <p className="mt-1 text-xs text-ink-500">
                  {spot.topic} - ease {spot.ease}, {spot.agains} Again marks
                </p>
              </div>
            ))}
          </div>
        </div>
      }
    >
      <RequireAuth>
        <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <section className="surface rounded p-5">
            <ProgressBar value={masteredPercent} label="Assigned mastery" />
            <div className="mt-5">
              <StatRow label="Due today" value={String(activePlayer.dueToday)} tone="warn" />
              <StatRow label="Reviewed today" value={String(activePlayer.reviewedToday)} tone="good" />
              <StatRow label="Assigned terms" value={activePlayer.assignedQuestions.toLocaleString()} />
            </div>
          </section>

          <section className="rounded border border-ink-200 bg-white p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-ink-900">Activity heatmap</h2>
              <p className="text-sm text-ink-500">Last 5 weeks</p>
            </div>
            <div className="mt-5 max-w-lg">
              <ActivityHeatmap days={demoActivity} />
            </div>
          </section>
        </div>

        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-ink-900">Team mastery</h2>
          </div>
          <PlayerTable />
        </section>
      </RequireAuth>
    </AppShell>
  );
}
