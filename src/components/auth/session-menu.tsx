"use client";

import { LogOut, UserCircle } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";

export function SessionMenu() {
  const { loading, session, player, user, signOut } = useAuth();

  if (loading) {
    return <span className="hidden text-sm text-ink-500 lg:inline">Hello.</span>;
  }

  if (!session) {
    return <span className="hidden text-sm text-ink-500 lg:inline">Hello.</span>;
  }

  return (
    <div className="hidden items-center gap-2 lg:flex">
      <UserCircle aria-hidden className="h-4 w-4 text-ink-500" />
      <span className="max-w-36 truncate text-sm font-medium text-ink-700">
        {player?.name ?? user?.email ?? "Player"}
      </span>
      <button
        type="button"
        onClick={() => void signOut()}
        className="focus-ring rounded p-2 text-ink-500 transition hover:bg-white hover:text-ink-900"
        title="Sign out"
      >
        <LogOut aria-hidden className="h-4 w-4" />
        <span className="sr-only">Sign out</span>
      </button>
    </div>
  );
}
