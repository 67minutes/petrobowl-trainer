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

  const loadQueue = useCallback(async () => {
    if (!session?.access_token) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/drill/queue", {
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
  }, [session?.access_token]);

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

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <DrillCard card={data.card} accessToken={session?.access_token ?? ""} onReviewed={loadQueue} />
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
