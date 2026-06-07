"use client";

import { clsx } from "clsx";
import type {
  DrillFrequencyDay,
  DrillFrequencyWeek,
  LatestSessionAnalytics,
  WeakTopic
} from "@/types/analytics";

function shortDate(date: string) {
  const [, month, day] = date.split("-");
  return `${month}/${day}`;
}

export function DrillFrequencyChart({ days }: { days: DrillFrequencyDay[] }) {
  const maxReviews = Math.max(1, ...days.map((day) => day.reviews));

  return (
    <div>
      <div className="flex h-36 items-end gap-1" aria-label="Daily drill frequency">
        {days.map((day) => {
          const height = day.reviews === 0 ? 4 : Math.max(10, (day.reviews / maxReviews) * 100);
          return (
            <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="flex h-28 w-full items-end">
                <div
                  title={`${day.date}: ${day.reviews} reviews, ${day.accuracy}% accuracy`}
                  className={clsx(
                    "w-full rounded-t transition hover:bg-petrol-600",
                    day.reviews === 0 ? "bg-ink-200" : "bg-petrol-500"
                  )}
                  style={{ height: `${height}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs text-ink-500">
        <span>{days[0] ? shortDate(days[0].date) : ""}</span>
        <span>{days.at(-1) ? shortDate(days.at(-1)?.date ?? "") : ""}</span>
      </div>
    </div>
  );
}

export function WeeklyDrillChart({ weeks }: { weeks: DrillFrequencyWeek[] }) {
  const maxReviews = Math.max(1, ...weeks.map((week) => week.reviews));

  return (
    <div className="space-y-3">
      {weeks.map((week) => (
        <div key={`${week.startDate}-${week.endDate}`}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs">
            <span className="font-medium text-ink-700">
              {shortDate(week.startDate)} - {shortDate(week.endDate)}
            </span>
            <span className="text-ink-500">
              {week.reviews} reviews / {week.accuracy}%
            </span>
          </div>
          <div className="h-2 rounded bg-ink-200">
            <div
              className="h-2 rounded bg-petrol-500"
              style={{ width: `${Math.max(week.reviews ? 4 : 0, (week.reviews / maxReviews) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function WeakTopicBars({ topics }: { topics: WeakTopic[] }) {
  const maxScore = Math.max(1, ...topics.map((topic) => topic.weaknessScore));

  if (!topics.length) {
    return <p className="text-sm text-ink-500">No weak topics yet. Drill history will fill this in.</p>;
  }

  return (
    <div className="space-y-4">
      {topics.map((topic) => (
        <div key={topic.topicId}>
          <div className="mb-2 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">{topic.topic}</p>
              <p className="mt-1 text-xs text-ink-500">
                {topic.dueCount} due, {topic.againCount} Again, ease {topic.averageEase.toFixed(2)}
              </p>
            </div>
            <p className="text-sm font-semibold text-signal-600">{topic.weaknessScore}</p>
          </div>
          <div className="h-2 rounded bg-ink-200">
            <div
              className="h-2 rounded bg-signal-500"
              style={{ width: `${Math.max(4, (topic.weaknessScore / maxScore) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function QuizScoreBars({ session }: { session: LatestSessionAnalytics | null }) {
  if (!session) {
    return <p className="text-sm text-ink-500">Complete a quiz session to see score breakdowns here.</p>;
  }

  const sortedScores = [...session.scores].sort((left, right) => right.totalScore - left.totalScore);
  const maxScore = Math.max(1, ...sortedScores.map((score) => Math.max(0, score.totalScore)));

  return (
    <div className="space-y-4">
      {sortedScores.map((score) => (
        <div key={score.playerId}>
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-ink-900">{score.name}</span>
            <span className="font-semibold text-ink-900">{score.totalScore}</span>
          </div>
          <div className="h-2 rounded bg-ink-200">
            <div
              className="h-2 rounded bg-ink-900"
              style={{ width: `${Math.max(score.totalScore ? 4 : 0, (Math.max(0, score.totalScore) / maxScore) * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-ink-500">
            Defense {score.defenseScore}, offense {score.offenseBonus}, {score.correctAnswers} correct
          </p>
        </div>
      ))}
    </div>
  );
}
