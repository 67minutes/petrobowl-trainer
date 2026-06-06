"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Player } from "@/types/database";

type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  player: Player | null;
  playerError: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshPlayer: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

async function fetchPlayer(activeSession: Session) {
  const token = activeSession.access_token;
  if (!token) {
    return null;
  }

  const response = await fetch("/api/auth/player", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const payload = (await response.json()) as { player: Player | null; error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Player lookup failed.");
  }

  return payload.player;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);

  const loadPlayer = useCallback(async (activeSession: Session | null) => {
    setPlayerError(null);

    if (!activeSession?.user) {
      setPlayer(null);
      return;
    }

    try {
      setPlayer(await fetchPlayer(activeSession));
    } catch (error) {
      setPlayer(null);
      setPlayerError(error instanceof Error ? error.message : "Player lookup failed.");
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) {
        return;
      }

      setSession(data.session);
      await loadPlayer(data.session);
      if (mounted) {
        setLoading(false);
      }
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void loadPlayer(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadPlayer]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      player,
      playerError,
      signIn: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) {
          return { error: error.message };
        }

        setSession(data.session);
        await loadPlayer(data.session);
        return { error: null };
      },
      signOut: async () => {
        await supabase.auth.signOut();
        setSession(null);
        setPlayer(null);
        setPlayerError(null);
      },
      refreshPlayer: async () => {
        await loadPlayer(session);
      }
    }),
    [loadPlayer, loading, player, playerError, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
