"use client";

import { ActivityHeatmap } from "@/components/activity-heatmap";
import { useDashboardData } from "@/components/dashboard/use-dashboard-data";
import { ProgressBar } from "@/components/progress-bar";
import { StatRow } from "@/components/stat-row";

export function AnalyticsContent() {
  const { data, loading, error } = useDashboardData();

  if (loading) {
    return (
      <div className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">Hello.</h2>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">Hello.</h2>
        <p className="mt-3 text-sm text-red-600">{error ?? "Analytics unavailable."}</p>
      </div>
    );
  }

  const reviewedToday = data.players.reduce((sum, player) => sum + player.reviewedToday, 0);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded border border-ink-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-ink-900">Team progress</h2>
        <div className="mt-4 divide-y divide-ink-200">
          {data.players.map((player) => {
            const mastery =
              player.assignedQuestions === 0
                ? 0
                : (player.mastered / player.assignedQuestions) * 100;

            return (
              <div key={player.id} className="py-4">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <p className="font-medium text-ink-900">{player.name}</p>
                  <p className="text-sm text-ink-500">{player.assignedQuestions.toLocaleString()}</p>
                </div>
                <ProgressBar value={mastery} label={`${player.mastered.toLocaleString()} mastered`} />
              </div>
            );
          })}
        </div>
      </section>

      <section className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">Hello.</h2>
        <div className="mt-3">
          <StatRow label="Reviewed today" value={String(reviewedToday)} tone="good" />
          <StatRow label="Total terms" value={data.totalQuestions.toLocaleString()} />
          <StatRow label="Unowned terms" value={data.unownedQuestions.toLocaleString()} />
        </div>
        <div className="mt-5 max-w-lg">
          <ActivityHeatmap days={data.activity} />
        </div>
      </section>
    </div>
  );
}
