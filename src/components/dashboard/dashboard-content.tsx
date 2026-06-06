"use client";

import { useEffect, useMemo, useState } from "react";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import { useAuth } from "@/components/auth/auth-provider";
import { PlayerTable } from "@/components/player-table";
import { ProgressBar } from "@/components/progress-bar";
import { StatRow } from "@/components/stat-row";
import type { DashboardData } from "@/types/dashboard";

type DashboardResponse = {
  data?: DashboardData;
  error?: string;
};

export function DashboardContent() {
  const { session } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      if (!session?.access_token) {
        setData(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/dashboard", {
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        });
        const payload = (await response.json()) as DashboardResponse;

        if (!response.ok || !payload.data) {
          throw new Error(payload.error ?? "Dashboard unavailable.");
        }

        if (mounted) {
          setData(payload.data);
        }
      } catch (fetchError) {
        if (mounted) {
          setError(fetchError instanceof Error ? fetchError.message : "Dashboard unavailable.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      mounted = false;
    };
  }, [session?.access_token]);

  const activePlayer = useMemo(
    () => data?.players.find((player) => player.id === data.activePlayerId) ?? null,
    [data]
  );

  if (loading) {
    return (
      <div className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">Hello.</h2>
      </div>
    );
  }

  if (error || !data || !activePlayer) {
    return (
      <div className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">Hello.</h2>
        <p className="mt-3 text-sm text-red-600">{error ?? "Dashboard unavailable."}</p>
      </div>
    );
  }

  const masteredPercent =
    activePlayer.assignedQuestions === 0
      ? 0
      : (activePlayer.mastered / activePlayer.assignedQuestions) * 100;

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)_320px]">
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
            <ActivityHeatmap days={data.activity} />
          </div>
        </section>

        <section className="rounded border border-ink-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-ink-900">Weak spots</h2>
          {data.weakSpots.length ? (
            <div className="mt-3 divide-y divide-ink-200">
              {data.weakSpots.map((spot) => (
                <div key={spot.questionId} className="py-3">
                  <p className="text-sm font-medium text-ink-900">{spot.term}</p>
                  <p className="mt-1 text-xs text-ink-500">
                    {spot.topic} - ease {spot.ease.toFixed(2)}, {spot.agains} Again marks
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-500">None yet.</p>
          )}
        </section>
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-ink-900">Team mastery</h2>
        </div>
        <PlayerTable players={data.players} />
      </section>
    </>
  );
}
