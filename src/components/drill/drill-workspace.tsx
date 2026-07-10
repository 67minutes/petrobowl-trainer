"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Crosshair, ListChecks, Plus, RotateCcw, Sparkles, Target } from "lucide-react";
import { clsx } from "clsx";
import { DrillCard, type ReviewOutcome } from "@/components/drill-card";
import { useAuth } from "@/components/auth/auth-provider";
import { fireConfetti } from "@/components/gamification/confetti";
import { parseDrillMode } from "@/lib/drill-queue";
import { StatRow } from "@/components/stat-row";
import type { DrillMode, DrillQueueData } from "@/types/drill";

type RunStats = { xp: number; correct: number; total: number; maxCombo: number };

const EMPTY_RUN: RunStats = { xp: 0, correct: 0, total: 0, maxCombo: 0 };

type DrillQueueResponse = {
  data?: DrillQueueData;
  error?: string;
};

const modes: { id: DrillMode; label: string; detail: string }[] = [
  { id: "smart", label: "Smart", detail: "Due, then new" },
  { id: "due", label: "Due", detail: "Scheduled reviews" },
  { id: "weak", label: "Weak", detail: "Low ease and Again marks" },
  { id: "new", label: "New", detail: "Unseen cards" }
];

const sessionTargets = [10, 20, 40];

function readInitialMode() {
  if (typeof window === "undefined") {
    return "smart";
  }
  return parseDrillMode(new URLSearchParams(window.location.search).get("mode"));
}

function readInitialTopicIds() {
  if (typeof window === "undefined") {
    return [];
  }
  const params = new URLSearchParams(window.location.search);
  return params
    .getAll("topicIds")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

export function DrillWorkspace() {
  const { session } = useAuth();
  const [data, setData] = useState<DrillQueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limitOverride, setLimitOverride] = useState(false);
  const [mode, setMode] = useState<DrillMode>(readInitialMode);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>(readInitialTopicIds);
  const [sessionTarget, setSessionTarget] = useState(20);
  const [reviewedInRun, setReviewedInRun] = useState(0);
  const [runStats, setRunStats] = useState<RunStats>(EMPTY_RUN);

  const loadQueue = useCallback(async () => {
    if (!session?.access_token) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        mode
      });
      if (limitOverride) {
        params.set("limitOverride", "true");
      }
      for (const topicId of selectedTopicIds) {
        params.append("topicIds", topicId);
      }

      const response = await fetch(`/api/drill/queue?${params.toString()}`, {
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
  }, [session?.access_token, limitOverride, mode, selectedTopicIds]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    setLimitOverride(false);
    setReviewedInRun(0);
    setRunStats(EMPTY_RUN);
  }, [mode, selectedTopicIds, sessionTarget]);

  const selectedTopicSet = useMemo(() => new Set(selectedTopicIds), [selectedTopicIds]);
  const allTopicsSelected = selectedTopicIds.length === 0;
  const dailyLimitReached =
    data &&
    !data.card &&
    !limitOverride &&
    (data.mode === "smart" || data.mode === "new") &&
    data.stats.unseenQuestions > 0 &&
    data.stats.newCards === 0 &&
    (data.mode === "new" || data.stats.dueReviews === 0);
  const sessionGoalReached = Boolean(data?.card) && reviewedInRun >= sessionTarget;
  const perfectRun = runStats.total > 0 && runStats.correct === runStats.total;
  const runAccuracy = runStats.total === 0 ? 0 : Math.round((runStats.correct / runStats.total) * 100);

  useEffect(() => {
    if (sessionGoalReached) {
      fireConfetti({ particles: perfectRun ? 200 : 140, power: perfectRun ? 1.3 : 1 });
    }
    // Fire once when the goal is first reached.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionGoalReached]);

  function selectMode(nextMode: DrillMode) {
    setMode(nextMode);
  }

  function toggleTopic(topicId: string) {
    setSelectedTopicIds((current) => {
      const explicitCurrent = current.length ? current : data?.topicOptions.map((topic) => topic.id) ?? [];
      const next = explicitCurrent.includes(topicId)
        ? explicitCurrent.filter((id) => id !== topicId)
        : [...explicitCurrent, topicId];

      if (!next.length || next.length === data?.topicOptions.length) {
        return [];
      }

      return next;
    });
  }

  async function handleReviewed(outcome: ReviewOutcome) {
    setReviewedInRun((current) => current + 1);
    setRunStats((current) => ({
      xp: current.xp + (outcome.award?.xpGained ?? 0),
      correct: current.correct + (outcome.correct ? 1 : 0),
      total: current.total + 1,
      maxCombo: Math.max(current.maxCombo, outcome.award?.combo ?? 0)
    }));
    await loadQueue();
  }

  if (loading) {
    return (
      <div className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">Loading drill queue</h2>
        <p className="mt-2 text-sm text-ink-500">Preparing your assigned topics and review priority.</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">Drill queue unavailable</h2>
        <p className="mt-3 text-sm text-red-600">{error ?? "Queue unavailable."}</p>
      </div>
    );
  }

  const selectedTopicLabel = allTopicsSelected
    ? "All assigned topics"
    : `${selectedTopicIds.length} selected topic${selectedTopicIds.length === 1 ? "" : "s"}`;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <section className="rounded border border-ink-200 bg-white p-4">
          <div className="flex flex-col justify-between gap-4 border-b border-ink-200 pb-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-base font-semibold text-ink-900">Drill controls</h2>
              <p className="mt-1 text-sm text-ink-500">{selectedTopicLabel}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {sessionTargets.map((target) => (
                <button
                  key={target}
                  type="button"
                  onClick={() => setSessionTarget(target)}
                  className={clsx(
                    "focus-ring inline-flex items-center gap-2 rounded border px-3 py-2 text-sm transition",
                    sessionTarget === target
                      ? "border-ink-900 bg-ink-900 text-white"
                      : "border-ink-200 bg-white text-ink-600 hover:border-petrol-500 hover:text-petrol-600"
                  )}
                >
                  <Target aria-hidden className="h-4 w-4" />
                  {target}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)]">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">Topics</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTopicIds([])}
                  className={clsx(
                    "focus-ring inline-flex items-center gap-2 rounded border px-3 py-2 text-sm transition",
                    allTopicsSelected
                      ? "border-petrol-600 bg-petrol-600 text-white"
                      : "border-ink-200 bg-white text-ink-600 hover:border-petrol-500 hover:text-petrol-600"
                  )}
                >
                  <ListChecks aria-hidden className="h-4 w-4" />
                  All assigned
                </button>
                {data.topicOptions.map((topic) => {
                  const selected = allTopicsSelected || selectedTopicSet.has(topic.id);
                  return (
                    <button
                      key={topic.id}
                      type="button"
                      onClick={() => toggleTopic(topic.id)}
                      className={clsx(
                        "focus-ring inline-flex max-w-full items-center gap-2 rounded border px-3 py-2 text-sm transition",
                        selected
                          ? "border-ink-900 bg-ink-900 text-white"
                          : "border-ink-200 bg-white text-ink-600 hover:border-petrol-500 hover:text-petrol-600"
                      )}
                    >
                      {selected ? <Check aria-hidden className="h-4 w-4 shrink-0" /> : null}
                      <span className="truncate">{topic.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">Priority</p>
              <div className="grid grid-cols-2 gap-2">
                {modes.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectMode(item.id)}
                    className={clsx(
                      "focus-ring rounded border px-3 py-2 text-left transition",
                      mode === item.id
                        ? "border-ink-900 bg-ink-900 text-white"
                        : "border-ink-200 bg-white text-ink-700 hover:border-petrol-500 hover:text-petrol-600"
                    )}
                  >
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className={clsx("text-xs", mode === item.id ? "text-ink-200" : "text-ink-500")}>
                      {item.detail}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {sessionGoalReached ? (
          <section className="surface rounded p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-gold-500/15">
                <Sparkles aria-hidden className="h-6 w-6 text-gold-600" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-ink-900">
                  {perfectRun ? "Perfect run!" : "Session target reached"}
                </h2>
                <p className="text-sm text-ink-500">
                  You reviewed {reviewedInRun} card{reviewedInRun === 1 ? "" : "s"} in this set.
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="rounded border border-ink-200 bg-white p-4 text-center">
                <p className="text-2xl font-extrabold text-gold-600">+{runStats.xp}</p>
                <p className="text-xs text-ink-500">XP earned</p>
              </div>
              <div className="rounded border border-ink-200 bg-white p-4 text-center">
                <p className="text-2xl font-extrabold text-combo-600">{runAccuracy}%</p>
                <p className="text-xs text-ink-500">Accuracy</p>
              </div>
              <div className="rounded border border-ink-200 bg-white p-4 text-center">
                <p className="text-2xl font-extrabold text-flame-600">x{runStats.maxCombo}</p>
                <p className="text-xs text-ink-500">Best combo</p>
              </div>
            </div>

            {perfectRun ? (
              <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-combo-500 px-3 py-1 text-xs font-bold text-white">
                <Sparkles aria-hidden className="h-3.5 w-3.5" />
                Flawless — no misses!
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => {
                setReviewedInRun(0);
                setRunStats(EMPTY_RUN);
              }}
              className="focus-ring mt-5 flex w-full items-center justify-center gap-2 rounded bg-ink-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-700"
            >
              <RotateCcw aria-hidden className="h-4 w-4" />
              Start another set
            </button>
          </section>
        ) : dailyLimitReached ? (
          <section className="surface rounded p-5">
            <h2 className="text-lg font-semibold text-ink-900">Daily new-card limit reached</h2>
            <p className="mt-2 text-sm text-ink-500">
              {data.stats.unseenQuestions} unseen card{data.stats.unseenQuestions === 1 ? "" : "s"} remain in this scope.
            </p>
            <button
              type="button"
              onClick={() => setLimitOverride(true)}
              className="focus-ring mt-5 inline-flex items-center gap-2 rounded bg-ink-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-700"
            >
              <Plus aria-hidden className="h-4 w-4" />
              Continue with new cards
            </button>
          </section>
        ) : (
          <DrillCard card={data.card} accessToken={session?.access_token ?? ""} onReviewed={handleReviewed} />
        )}
      </div>

      <aside className="space-y-5">
        <section className="rounded border border-ink-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-ink-900">Queue</h2>
            <p className="text-xs text-ink-500">
              {reviewedInRun} / {sessionTarget}
            </p>
          </div>
          <div className="mt-3">
            <StatRow label="Due reviews" value={String(data.stats.dueReviews)} tone="warn" />
            <StatRow label="Weak cards" value={String(data.stats.weakCards)} />
            <StatRow label="New cards" value={String(data.stats.newCards)} />
            <StatRow label="Unseen" value={String(data.stats.unseenQuestions)} />
            <StatRow label="Mastered" value={String(data.stats.mastered)} tone="good" />
          </div>
        </section>

        <section className="rounded border border-ink-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <Crosshair aria-hidden className="h-4 w-4 text-petrol-600" />
            <h2 className="text-sm font-semibold text-ink-900">Topic load</h2>
          </div>
          <div className="mt-4 space-y-4">
            {data.topicOptions.map((topic) => {
              const dueShare = topic.assignedQuestions === 0 ? 0 : (topic.dueCount / topic.assignedQuestions) * 100;
              return (
                <div key={topic.id}>
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                    <span className="truncate font-medium text-ink-700">{topic.name}</span>
                    <span className="text-ink-500">{topic.dueCount} due</span>
                  </div>
                  <div className="h-2 rounded bg-ink-200">
                    <div
                      className="h-2 rounded bg-signal-500 transition-all"
                      style={{ width: `${Math.max(3, Math.min(100, dueShare))}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {topic.weakCount} weak, {topic.unseenCount} unseen
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </aside>
    </div>
  );
}
