"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import type { DashboardData } from "@/types/dashboard";

type DashboardResponse = {
  data?: DashboardData;
  error?: string;
};

const CACHE_TTL_MS = 60_000;
const dashboardCache = new Map<string, { data: DashboardData; expiresAt: number }>();

export function useDashboardData() {
  const { session } = useAuth();
  const cached = session?.access_token ? dashboardCache.get(session.access_token) : null;
  const initialData = cached && cached.expiresAt > Date.now() ? cached.data : null;
  const [data, setData] = useState<DashboardData | null>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const token = session?.access_token;

    async function loadDashboard() {
      if (!token) {
        setData(null);
        setLoading(false);
        return;
      }

      const cachedData = dashboardCache.get(token);
      if (cachedData && cachedData.expiresAt > Date.now()) {
        setData(cachedData.data);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/dashboard", {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        const payload = (await response.json()) as DashboardResponse;

        if (!response.ok || !payload.data) {
          throw new Error(payload.error ?? "Dashboard unavailable.");
        }

        if (mounted) {
          dashboardCache.set(token, {
            data: payload.data,
            expiresAt: Date.now() + CACHE_TTL_MS
          });
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
