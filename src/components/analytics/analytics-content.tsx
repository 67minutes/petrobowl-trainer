"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ClipboardList, Lightbulb, RadioTower } from "lucide-react";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import {
  DrillFrequencyChart,
  QuizScoreBars,
  WeakTopicBars,
  WeeklyDrillChart
} from "@/components/analytics/charts";
import { useAuth } from "@/components/auth/auth-provider";
import { ProgressBar } from "@/components/progress-bar";
import { StatRow } from "@/components/stat-row";
import type { AnalyticsData } from "@/types/analytics";

type AnalyticsResponse = {
  data?: AnalyticsData;
  error?: string;
};

function useAnalyticsData() {
  const { session } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const token = session?.access_token;

    async function loadAnalytics() {
      if (!token) {
        setData(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/analytics", {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        const payload = (await response.json()) as AnalyticsResponse;

        if (!response.ok || !payload.data) {
          throw new Error(payload.error ?? "Analytics unavailable.");
        }

        if (mounted) {
          setData(payload.data);
        }
      } catch (fetchError) {
        if (mounted) {
          setError(fetchError instanceof Error ? fetchError.message : "Analytics unavailable.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadAnalytics();

    return () => {
      mounted = false;
    };
  }, [session?.access_token]);

  return { data, loading, error };
}

function priorityClass(priority: "high" | "medium" | "low") {
  if (priority === "high") {
    return "bg-signal-500/15 text-signal-600";
  }
  if (priority === "medium") {
    return "bg-petrol-400/20 text-petrol-600";
  }
  return "bg-ink-100 text-ink-600";
}

export function AnalyticsContent() {
  const { data, loading, error } = useAnalyticsData();

  if (loading) {
    return (
      <div className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">Loading analytics</h2>
        <p className="mt-2 text-sm text-ink-500">Calculating weak topics, drill frequency, and latest quiz results.</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">Analytics unavailable</h2>
        <p className="mt-3 text-sm text-red-600">{error ?? "Analytics unavailable."}</p>
      </div>
    );
  }

  const heatmapDays = data.drillFrequency.map((day, index) => ({
    day: index + 1,
    count: day.reviews
  }));
  const latestScore = data.latestSession?.playerScore;

  return (
    <div className="space-y-6">
      <Link
        href="/coach"
        className="focus-ring flex items-center justify-between gap-3 rounded border border-ink-200 bg-white px-4 py-3 text-sm transition hover:border-ink-300"
      >
        <span className="text-ink-700">
          <span className="font-semibold text-ink-900">Strategy dashboard</span> — topic strength, offense/defense,
          readiness, and speed.
        </span>
        <ArrowRight aria-hidden className="h-4 w-4 text-ink-500" />
      </Link>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.metrics.map((metric) => (
          <div key={metric.label} className="rounded border border-ink-200 bg-white p-5">
            <p className="text-sm font-medium text-ink-500">{metric.label}</p>
            <p className="mt-2 text-3xl font-semibold text-ink-900">{metric.value}</p>
            {metric.detail ? <p className="mt-2 text-sm leading-5 text-ink-500">{metric.detail}</p> : null}
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded border border-ink-200 bg-white p-5">
          <div className="flex flex-col justify-between gap-4 border-b border-ink-200 pb-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold text-ink-900">Drill frequency</h2>
              <p className="mt-1 text-sm text-ink-500">Last 35 days of review volume and weekly accuracy.</p>
            </div>
            <Link
              href="/drill"
              className="focus-ring inline-flex items-center gap-2 rounded bg-ink-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-700"
            >
              Drill now
              <ArrowRight aria-hidden className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(240px,0.6fr)]">
            <DrillFrequencyChart days={data.drillFrequency} />
            <div>
              <WeeklyDrillChart weeks={data.weeklyDrill} />
              <div className="mt-5 max-w-sm">
                <ActivityHeatmap days={heatmapDays} />
              </div>
            </div>
          </div>
        </div>

        <div className="surface rounded p-5">
          <div className="flex items-center gap-2">
            <Lightbulb aria-hidden className="h-5 w-5 text-signal-600" />
            <h2 className="text-lg font-semibold text-ink-900">Next actions</h2>
          </div>
          <div className="mt-4 space-y-4">
            {data.suggestions.length ? (
              data.suggestions.map((suggestion) => (
                <div key={suggestion.id} className="border-b border-ink-200 pb-4 last:border-b-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-ink-900">{suggestion.title}</p>
                    <span className={`rounded px-2 py-1 text-xs font-semibold ${priorityClass(suggestion.priority)}`}>
                      {suggestion.priority}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-ink-500">{suggestion.detail}</p>
                  <Link
                    href={`/drill?mode=${suggestion.mode ?? "smart"}${
                      suggestion.topicId ? `&topicIds=${suggestion.topicId}` : ""
                    }`}
                    className="focus-ring mt-3 inline-flex items-center gap-2 rounded px-0 py-1 text-sm font-medium text-petrol-600 transition hover:text-petrol-500"
                  >
                    Open drill
                    <ArrowRight aria-hidden className="h-4 w-4" />
                  </Link>
                </div>
              ))
            ) : (
              <p className="text-sm text-ink-500">No suggestions yet. Complete drills or quiz sessions to build a signal.</p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded border border-ink-200 bg-white p-5">
          <div className="flex items-center justify-between gap-4 border-b border-ink-200 pb-4">
            <div>
              <h2 className="text-lg font-semibold text-ink-900">Weak subjects</h2>
              <p className="mt-1 text-sm text-ink-500">Ranked by due pressure, Again marks, ease, and slow recall.</p>
            </div>
          </div>
          <div className="mt-5">
            <WeakTopicBars topics={data.weakTopics} />
          </div>
        </div>

        <div className="rounded border border-ink-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-ink-900">Personal readiness</h2>
          <div className="mt-4">
            <ProgressBar value={data.summary.readiness} label="Assigned mastery" />
          </div>
          <div className="mt-4">
            <StatRow label="Assigned terms" value={data.summary.assignedQuestions.toLocaleString()} />
            <StatRow label="Mastered" value={data.summary.mastered.toLocaleString()} tone="good" />
            <StatRow label="Due today" value={String(data.summary.dueToday)} tone="warn" />
            <StatRow label="7-day reviews" value={data.summary.reviewedLast7.toLocaleString()} />
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded border border-ink-200 bg-white p-5">
          <div className="flex items-center gap-2 border-b border-ink-200 pb-4">
            <RadioTower aria-hidden className="h-5 w-5 text-petrol-600" />
            <div>
              <h2 className="text-lg font-semibold text-ink-900">Latest quiz session</h2>
              <p className="mt-1 text-sm text-ink-500">
                {data.latestSession
                  ? `${data.latestSession.name} - ${data.latestSession.answeredCount} answered`
                  : "No completed session yet"}
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(260px,1.1fr)]">
            <div>
              {data.latestSession ? (
                <>
                  <p className="text-sm text-ink-500">Your total score</p>
                  <p className="mt-2 text-4xl font-semibold text-ink-900">
                    {latestScore ? latestScore.totalScore : 0}
                  </p>
                  <div className="mt-5">
                    <StatRow label="On topic" value={String(latestScore?.onTopic ?? 0)} tone="good" />
                    <StatRow label="Off topic" value={String(latestScore?.outOfTopic ?? 0)} />
                    <StatRow label="Missed own topic" value={String(latestScore?.missedTopic ?? 0)} tone="warn" />
                  </div>
                </>
              ) : (
                <p className="text-sm text-ink-500">Run and complete a buzzer session to unlock this panel.</p>
              )}
            </div>
            <QuizScoreBars session={data.latestSession} />
          </div>
        </div>

        <div className="rounded border border-ink-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <ClipboardList aria-hidden className="h-5 w-5 text-signal-600" />
            <h2 className="text-lg font-semibold text-ink-900">Quiz follow-up</h2>
          </div>
          <div className="mt-4 space-y-4">
            {data.latestSession?.followUps.length ? (
              data.latestSession.followUps.map((item) => (
                <div key={`${item.questionId}-${item.reason}`} className="border-b border-ink-200 pb-4 last:border-b-0 last:pb-0">
                  <p className="text-sm font-semibold text-ink-900">{item.term}</p>
                  <p className="mt-1 text-xs text-ink-500">
                    {item.topic} - {item.reason.replaceAll("-", " ")}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-ink-500">No personal follow-up items from the latest completed session.</p>
            )}
          </div>
          {data.latestSession?.topicBreakdown.length ? (
            <div className="mt-5 border-t border-ink-200 pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">Session misses</p>
              <div className="mt-3 space-y-2">
                {data.latestSession.topicBreakdown.map((topic) => (
                  <div key={topic.topic} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-ink-700">{topic.topic}</span>
                    <span className="font-medium text-ink-900">
                      {topic.misses} miss{topic.misses === 1 ? "" : "es"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded border border-ink-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-ink-900">Team context</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {data.team.players.map((player) => {
            const mastery = player.assignedQuestions === 0 ? 0 : (player.mastered / player.assignedQuestions) * 100;
            return (
              <div key={player.id} className="rounded border border-ink-200 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="font-semibold text-ink-900">{player.name}</p>
                  <p className="text-sm text-signal-600">{player.dueToday} due</p>
                </div>
                <ProgressBar value={mastery} label={`${player.mastered.toLocaleString()} mastered`} />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
