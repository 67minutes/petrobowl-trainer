"use client";

import { useAuth } from "@/components/auth/auth-provider";

export function AuthGreeting({ fallback = "Hi." }: { fallback?: string }) {
  const { loading, player } = useAuth();

  if (loading) {
    return fallback;
  }

  return player ? `Hi, ${player.name}.` : fallback;
}
