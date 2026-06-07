"use client";

import { AuthPanel } from "@/components/auth/auth-panel";
import { useAuth } from "@/components/auth/auth-provider";

type RequireAuthProps = {
  adminOnly?: boolean;
  children: React.ReactNode;
};

export function RequireAuth({ adminOnly = false, children }: RequireAuthProps) {
  const { loading, session, player, playerError } = useAuth();

  if (loading) {
    return (
      <div className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">Checking session</h2>
        <p className="mt-2 text-sm text-ink-500">Confirming your PetroBowl trainer access.</p>
      </div>
    );
  }

  if (!session) {
    return <AuthPanel />;
  }

  if (playerError) {
    return (
      <div className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">Player profile unavailable</h2>
        <p className="mt-3 text-sm text-red-600">{playerError}</p>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">No player profile linked</h2>
        <p className="mt-3 text-sm text-signal-600">No player linked.</p>
      </div>
    );
  }

  if (adminOnly && player.role !== "admin") {
    return (
      <div className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">Admin access required</h2>
        <p className="mt-3 text-sm text-signal-600">Admin only.</p>
      </div>
    );
  }

  return children;
}
