"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import type { DashboardData } from "@/types/dashboard";

type DashboardResponse = {
  data?: DashboardData;
  error?: string;
};

export function useDashboardData() {
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

  return {
    data,
    activePlayer,
    loading,
    error
  };
}
