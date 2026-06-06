"use client";

import { useDashboardData } from "@/components/dashboard/use-dashboard-data";

export function SessionConsole() {
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
        <p className="mt-3 text-sm text-red-600">{error ?? "Session unavailable."}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">Hello.</h2>
        <p className="mt-3 text-sm text-ink-500">No active session.</p>
      </div>

      <div className="rounded border border-ink-200 bg-white">
        <div className="border-b border-ink-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-ink-900">Scores</h3>
        </div>
        <div className="divide-y divide-ink-200">
          {data.players.map((player) => (
            <div key={player.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-ink-900">{player.name}</p>
                <p className="text-xs text-ink-500">{player.topicCount} topics</p>
              </div>
              <p className="text-xl font-semibold text-ink-900">0</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
