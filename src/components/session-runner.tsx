"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Ban, CheckCircle2, RotateCcw, Square, XCircle } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import type { QuizSessionData } from "@/types/session";

type SessionResponse = {
  data?: QuizSessionData;
  error?: string;
};

async function readSessionResponse(response: Response) {
  const payload = (await response.json()) as SessionResponse;

  if (!response.ok || !payload.data) {
    throw new Error(payload.error ?? "Session unavailable.");
  }

  return payload.data;
}

function isAnswered(question: { buzzedBy: string | null; correct: boolean }) {
  return question.buzzedBy !== null || !question.correct;
}

export function SessionRunner({ sessionId }: { sessionId: string }) {
  const { session } = useAuth();
  const [data, setData] = useState<QuizSessionData | null>(null);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    if (!session?.access_token) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/session/current?sessionId=${encodeURIComponent(sessionId)}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });
      setData(await readSessionResponse(response));
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : "Session unavailable.");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, sessionId]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    const questions = data?.session?.questions ?? [];
    const firstOpen = questions.findIndex((question) => !isAnswered(question));

    if (firstOpen >= 0) {
      setCursor(firstOpen);
    } else if (questions.length) {
      setCursor(questions.length - 1);
    } else {
      setCursor(0);
    }
  }, [data?.session?.id, data?.session?.questions]);

  async function postSession(path: string, body: Record<string, unknown>) {
    if (!session?.access_token) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      setData(await readSessionResponse(response));
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : "Session unavailable.");
    } finally {
      setSubmitting(false);
    }
  }

  const activeSession = data?.session ?? null;
  const questions = activeSession?.questions ?? [];
  const current = questions[cursor] ?? null;
  const answeredCount = questions.filter(isAnswered).length;
  const sessionClosed = activeSession?.status === "completed";
  const currentScoreByPlayer = useMemo(
    () => new Map((data?.scores ?? []).map((score) => [score.playerId, score])),
    [data?.scores]
  );

  if (loading) {
    return (
      <div className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">Loading session console</h2>
        <p className="mt-2 text-sm text-ink-500">Opening this quizmaster session.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link
        href="/session"
        className="focus-ring inline-flex items-center gap-2 rounded border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 transition hover:border-ink-300"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" />
        Sessions
      </Link>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="surface rounded p-5">
          {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

          {activeSession && current ? (
            <div>
              <div className="flex flex-col justify-between gap-4 border-b border-ink-200 pb-4 sm:flex-row sm:items-start">
                <div>
                  <p className="text-sm text-ink-500">
                    Question {cursor + 1} of {questions.length}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-ink-900">{activeSession.name}</h2>
                  {sessionClosed ? <p className="mt-1 text-sm text-ink-500">Completed session</p> : null}
                </div>
                {!sessionClosed ? (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void postSession("/api/session/complete", { sessionId: activeSession.id })}
                    className="focus-ring inline-flex items-center justify-center gap-2 rounded border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 transition hover:border-signal-500 hover:text-signal-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Square aria-hidden className="h-4 w-4" />
                    Complete
                  </button>
                ) : null}
              </div>

              <div className="py-7">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-petrol-600">
                  {current.topicName ?? "Topic"} / {current.ownerNames.length ? current.ownerNames.join(" & ") : "Unowned"}
                </p>
                <p className="mt-3 text-2xl font-semibold leading-9 text-ink-900">{current.question}</p>
                <p className="mt-4 text-lg text-ink-600">Answer: {current.answer}</p>
                {current.missedBy.length ? (
                  <p className="mt-3 text-sm text-signal-600">
                    Locked out: {current.missedByNames.join(", ")}
                  </p>
                ) : null}
                {isAnswered(current) ? (
                  <p className="mt-1 text-sm text-ink-500">
                    {current.correct
                      ? `${current.buzzedByName} - Correct`
                      : current.missedBy.length
                        ? "No correct answer"
                        : "No Buzz"}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {data?.players.map((player) => {
                  const lockedOut = current.missedBy.includes(player.id);
                  const resolved = isAnswered(current);

                  return (
                    <div key={player.id} className="rounded border border-ink-200 bg-white p-3">
                      <p className="text-sm font-semibold text-ink-900">
                        {player.name}
                        {lockedOut ? (
                          <span className="ml-2 text-xs font-normal text-signal-600">locked out</span>
                        ) : null}
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={submitting || sessionClosed || resolved || lockedOut}
                          onClick={() =>
                            void postSession("/api/session/question", {
                              action: "correct",
                              sessionQuestionId: current.id,
                              playerId: player.id
                            })
                          }
                          className="focus-ring inline-flex items-center justify-center gap-2 rounded bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <CheckCircle2 aria-hidden className="h-4 w-4" />
                          Correct
                        </button>
                        <button
                          type="button"
                          disabled={submitting || sessionClosed || resolved || lockedOut}
                          onClick={() =>
                            void postSession("/api/session/question", {
                              action: "miss",
                              sessionQuestionId: current.id,
                              playerId: player.id
                            })
                          }
                          className="focus-ring inline-flex items-center justify-center gap-2 rounded bg-signal-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-signal-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <XCircle aria-hidden className="h-4 w-4" />
                          Miss
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {!isAnswered(current) ? (
                    <button
                      type="button"
                      disabled={submitting || sessionClosed}
                      onClick={() =>
                        void postSession("/api/session/question", {
                          action: "noCorrect",
                          sessionQuestionId: current.id
                        })
                      }
                      className="focus-ring inline-flex items-center justify-center gap-2 rounded border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-signal-600 transition hover:border-signal-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Ban aria-hidden className="h-4 w-4" />
                      {current.missedBy.length ? "No correct answer" : "No Buzz"}
                    </button>
                  ) : null}
                  {isAnswered(current) || current.missedBy.length ? (
                    <button
                      type="button"
                      disabled={submitting || sessionClosed}
                      onClick={() =>
                        void postSession("/api/session/question", {
                          action: "reset",
                          sessionQuestionId: current.id
                        })
                      }
                      className="focus-ring inline-flex items-center justify-center gap-2 rounded border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-600 transition hover:border-ink-400 hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RotateCcw aria-hidden className="h-4 w-4" />
                      Reset
                    </button>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCursor((value) => Math.max(0, value - 1))}
                    className="focus-ring rounded border border-ink-200 bg-white p-2 text-ink-600 transition hover:text-ink-900"
                    title="Previous"
                  >
                    <ArrowLeft aria-hidden className="h-4 w-4" />
                    <span className="sr-only">Previous</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCursor((value) => Math.min(questions.length - 1, value + 1))}
                    className="focus-ring rounded border border-ink-200 bg-white p-2 text-ink-600 transition hover:text-ink-900"
                    title="Next"
                  >
                    <ArrowRight aria-hidden className="h-4 w-4" />
                    <span className="sr-only">Next</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <h2 className="text-lg font-semibold text-ink-900">No session questions</h2>
              <p className="mt-3 text-sm text-ink-500">This session could not be opened or has no questions.</p>
            </div>
          )}
        </div>

        <div className="rounded border border-ink-200 bg-white">
          <div className="border-b border-ink-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-ink-900">Scores</h3>
            {activeSession ? (
              <p className="mt-1 text-xs text-ink-500">
                {answeredCount} / {questions.length}
              </p>
            ) : null}
          </div>
          <div className="divide-y divide-ink-200">
            {(data?.players ?? []).map((player) => {
              const score = currentScoreByPlayer.get(player.id);

              return (
                <div key={player.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink-900">{player.name}</p>
                    <p className="text-xs text-ink-500">
                      D {score?.defenseScore ?? 0} / O {score?.offenseBonus ?? 0}
                    </p>
                  </div>
                  <p className="text-xl font-semibold text-ink-900">{score?.totalScore ?? 0}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
