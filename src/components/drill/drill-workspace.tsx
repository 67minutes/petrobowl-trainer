"use client";

import { useCallback, useEffect, useState } from "react";
import { DrillCard } from "@/components/drill-card";
import { useAuth } from "@/components/auth/auth-provider";
import { StatRow } from "@/components/stat-row";
import type { DrillQueueData } from "@/types/drill";

type DrillQueueResponse = {
  data?: DrillQueueData;
  error?: string;
};

export function DrillWorkspace() {
  const { session } = useAuth();
  const [data, setData] = useState<DrillQueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overrideLimit, setOverrideLimit] = useState(false);

  const loadQueue = useCallback(async () => {
    if (!session?.access_token) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url = overrideLimit ? "/api/drill/queue?overrideLimit=true" : "/api/drill/queue";
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });
      const payload = (await response.json()) as DrillQueueResponse;

      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "Queue unavailable.");
      }

      setData(payload.data);
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : "Queue unavailable.");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, overrideLimit]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

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
        <p className="mt-3 text-sm text-red-600">{error ?? "Queue unavailable."}</p>
      </div>
    );
  }

  const limitReached =
    !data.card && data.stats.dueReviews === 0 && data.stats.unseenQuestions > 0 && !overrideLimit;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      {limitReached ? (
        <div className="surface rounded p-5">
          <h2 className="text-lg font-semibold text-ink-900">Daily limit reached.</h2>
          <p className="mt-2 text-sm text-ink-500">
            {data.stats.unseenQuestions} unseen card{data.stats.unseenQuestions !== 1 ? "s" : ""} remaining.
          </p>
          <button
            type="button"
            onClick={() => setOverrideLimit(true)}
            className="focus-ring mt-5 inline-flex items-center rounded bg-ink-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-700"
          >
            Continue anyway
          </button>
        </div>
      ) : (
        <DrillCard card={data.card} accessToken={session?.access_token ?? ""} onReviewed={loadQueue} />
      )}
      <aside className="rounded border border-ink-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-ink-900">Queue</h2>
        <div className="mt-3">
          <StatRow label="Due today" value={String(data.stats.dueReviews)} tone="warn" />
          <StatRow label="New cards" value={String(data.stats.newCards)} />
          <StatRow label="Mastered" value={String(data.stats.mastered)} tone="good" />
        </div>
      </aside>
    </div>
  );
}
