"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, LogOut } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";

export function AuthPanel() {
  const { loading, session, user, player, playerError, signIn, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await signIn(email, password);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
    } else {
      setPassword("");
    }
  }

  if (loading) {
    return (
      <div className="surface rounded p-5">
        <h2 className="text-sm font-semibold text-ink-900">Hello.</h2>
      </div>
    );
  }

  if (session) {
    return (
      <div className="surface rounded p-5">
        <h2 className="text-sm font-semibold text-ink-900">
          Hi, {player?.name ?? user?.email ?? "player"}.
        </h2>
        {playerError ? <p className="mt-3 text-sm text-red-600">{playerError}</p> : null}
        {!player && !playerError ? (
          <p className="mt-3 text-sm text-signal-600">No player linked.</p>
        ) : null}
        <button
          type="button"
          onClick={() => void signOut()}
          className="focus-ring mt-5 inline-flex w-full items-center justify-center gap-2 rounded bg-ink-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-700"
        >
          Sign out
          <LogOut aria-hidden className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="surface rounded p-5">
      <h2 className="text-sm font-semibold text-ink-900">Welcome back.</h2>
      <div className="mt-5 space-y-3">
        <input
          aria-label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="email@speitb.org"
          required
          className="focus-ring w-full rounded border border-ink-200 bg-white px-3 py-2 text-sm"
        />
        <input
          aria-label="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="password"
          required
          className="focus-ring w-full rounded border border-ink-200 bg-white px-3 py-2 text-sm"
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded bg-ink-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Signing in" : "Sign in"}
          <ArrowRight aria-hidden className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}
