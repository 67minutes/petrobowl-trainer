import type {
  AnalyticsSuggestion,
  DrillFrequencyDay,
  DrillFrequencyWeek,
  LatestSessionAnalytics,
  WeakTopic
} from "@/types/analytics";

export type AnalyticsQuestion = {
  id: string;
  topicId: string;
  topic: string;
};

export type AnalyticsProgressRow = {
  questionId: string;
  easeFactor: number;
  intervalDays: number;
  nextReview: string;
};

export type AnalyticsResponseRow = {
  questionId: string;
  rating: "again" | "hard" | "good" | "easy";
  responseTimeMs: number;
  reviewedAt: string;
};

export type CompletedSessionSummary = {
  id: string;
  name: string;
  createdAt: string;
  completedAt: string | null;
};

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildDrillFrequencyDays(
  responses: AnalyticsResponseRow[],
  today = new Date(),
  days = 35
): DrillFrequencyDay[] {
  const start = addDays(today, -(days - 1));
  const byDate = new Map<string, DrillFrequencyDay>();

  for (let index = 0; index < days; index += 1) {
    const date = dateOnly(addDays(start, index));
    byDate.set(date, { date, reviews: 0, correct: 0, accuracy: 0 });
  }

  for (const response of responses) {
    const date = response.reviewedAt.slice(0, 10);
    const day = byDate.get(date);
    if (!day) {
      continue;
    }
    day.reviews += 1;
    if (response.rating !== "again") {
      day.correct += 1;
    }
  }

  return [...byDate.values()].map((day) => ({
    ...day,
    accuracy: day.reviews === 0 ? 0 : clampPercent((day.correct / day.reviews) * 100)
  }));
}

export function buildWeeklyDrillBuckets(days: DrillFrequencyDay[]): DrillFrequencyWeek[] {
  const buckets: DrillFrequencyWeek[] = [];

  for (let index = 0; index < days.length; index += 7) {
    const weekDays = days.slice(index, index + 7);
    const reviews = weekDays.reduce((sum, day) => sum + day.reviews, 0);
    const correct = weekDays.reduce((sum, day) => sum + day.correct, 0);
    buckets.push({
      label: `Week ${buckets.length + 1}`,
      startDate: weekDays[0]?.date ?? "",
      endDate: weekDays[weekDays.length - 1]?.date ?? "",
      reviews,
      correct,
      accuracy: reviews === 0 ? 0 : clampPercent((correct / reviews) * 100)
    });
  }

  return buckets;
}

export function rankWeakTopics(input: {
  questions: AnalyticsQuestion[];
  progressRows: AnalyticsProgressRow[];
  responses: AnalyticsResponseRow[];
  today: string;
}) {
  const questionById = new Map(input.questions.map((question) => [question.id, question]));
  const progressByQuestionId = new Map(input.progressRows.map((progress) => [progress.questionId, progress]));
  const topicStats = new Map<
    string,
    {
      topicId: string;
      topic: string;
      assignedQuestions: number;
      seenQuestions: number;
      dueCount: number;
      masteredCount: number;
      reviews: number;
      correct: number;
      againCount: number;
      slowCount: number;
      easeTotal: number;
      easeCount: number;
    }
  >();

  for (const question of input.questions) {
    if (!topicStats.has(question.topicId)) {
      topicStats.set(question.topicId, {
        topicId: question.topicId,
        topic: question.topic,
        assignedQuestions: 0,
        seenQuestions: 0,
        dueCount: 0,
        masteredCount: 0,
        reviews: 0,
        correct: 0,
        againCount: 0,
        slowCount: 0,
        easeTotal: 0,
        easeCount: 0
      });
    }
    const topic = topicStats.get(question.topicId);
    if (!topic) {
      continue;
    }
    topic.assignedQuestions += 1;
    const progress = progressByQuestionId.get(question.id);
    if (progress) {
      topic.seenQuestions += 1;
      topic.easeTotal += progress.easeFactor;
      topic.easeCount += 1;
      if (progress.nextReview <= input.today) {
        topic.dueCount += 1;
      }
      if (progress.intervalDays >= 21) {
        topic.masteredCount += 1;
      }
    }
  }

  for (const response of input.responses) {
    const question = questionById.get(response.questionId);
    if (!question) {
      continue;
    }
    const topic = topicStats.get(question.topicId);
    if (!topic) {
      continue;
    }
    topic.reviews += 1;
    if (response.rating !== "again") {
      topic.correct += 1;
    } else {
      topic.againCount += 1;
    }
    if (response.responseTimeMs >= 15_000) {
      topic.slowCount += 1;
    }
  }

  return [...topicStats.values()]
    .map<WeakTopic>((topic) => {
      const averageEase = topic.easeCount ? topic.easeTotal / topic.easeCount : 2.5;
      const accuracy = topic.reviews === 0 ? 0 : clampPercent((topic.correct / topic.reviews) * 100);
      const unseenShare =
        topic.assignedQuestions === 0
          ? 0
          : ((topic.assignedQuestions - topic.seenQuestions) / topic.assignedQuestions) * 100;
      const duePressure = topic.assignedQuestions === 0 ? 0 : (topic.dueCount / topic.assignedQuestions) * 100;
      const againPressure = topic.reviews === 0 ? 0 : (topic.againCount / topic.reviews) * 100;
      const weakEasePressure = Math.max(0, 2.5 - averageEase) * 18;
      const slowPressure = topic.reviews === 0 ? 0 : (topic.slowCount / topic.reviews) * 18;
      const weaknessScore = Math.round(
        duePressure * 0.35 + againPressure * 0.3 + unseenShare * 0.15 + weakEasePressure + slowPressure
      );

      return {
        topicId: topic.topicId,
        topic: topic.topic,
        assignedQuestions: topic.assignedQuestions,
        seenQuestions: topic.seenQuestions,
        dueCount: topic.dueCount,
        masteredCount: topic.masteredCount,
        reviews: topic.reviews,
        againCount: topic.againCount,
        slowCount: topic.slowCount,
        averageEase,
        accuracy,
        weaknessScore
      };
    })
    .sort((left, right) => {
      const weaknessDifference = right.weaknessScore - left.weaknessScore;
      if (weaknessDifference !== 0) {
        return weaknessDifference;
      }
      return right.dueCount - left.dueCount;
    });
}

export function selectLatestCompletedSession(sessions: CompletedSessionSummary[]) {
  return [...sessions].sort((left, right) => {
    const leftDate = left.completedAt ?? left.createdAt;
    const rightDate = right.completedAt ?? right.createdAt;
    return rightDate.localeCompare(leftDate);
  })[0] ?? null;
}

export function buildPersonalSuggestions(input: {
  weakTopics: WeakTopic[];
  dueToday: number;
  reviewedLast7: number;
  consistencyDays: number;
  latestSession: LatestSessionAnalytics | null;
}) {
  const suggestions: AnalyticsSuggestion[] = [];
  const weakest = input.weakTopics[0] ?? null;

  if (input.dueToday >= 25) {
    suggestions.push({
      id: "due-backlog",
      priority: "high",
      title: "Clear due reviews first",
      detail: `Run ${Math.min(input.dueToday, 40)} Due reviews before adding new cards.`,
      mode: "due"
    });
  }

  if (weakest && weakest.weaknessScore >= 15) {
    suggestions.push({
      id: `weak-${weakest.topicId}`,
      priority: input.dueToday >= 25 ? "medium" : "high",
      title: `Focus ${weakest.topic}`,
      detail: `Train Weak mode for ${weakest.topic}; ${weakest.againCount} Again marks and ${weakest.dueCount} due cards need cleanup.`,
      topicId: weakest.topicId,
      mode: "weak"
    });
  }

  if (input.latestSession?.followUps.length) {
    const first = input.latestSession.followUps[0];
    suggestions.push({
      id: "latest-session-followup",
      priority: "medium",
      title: "Review quiz misses",
      detail: `Start with ${first.topic}: ${first.term}. The latest session left ${input.latestSession.followUps.length} follow-up item${
        input.latestSession.followUps.length === 1 ? "" : "s"
      }.`,
      topicId: undefined,
      mode: "weak"
    });
  }

  if (input.consistencyDays < 4) {
    suggestions.push({
      id: "frequency-repair",
      priority: "medium",
      title: "Rebuild drill frequency",
      detail: "Aim for four active drill days this week before raising the new-card pace.",
      mode: "smart"
    });
  }

  if (!suggestions.length && input.reviewedLast7 >= 80) {
    suggestions.push({
      id: "expand-new",
      priority: "low",
      title: "Add new cards",
      detail: "Due pressure is low. Use New mode on an assigned topic to widen coverage.",
      mode: "new"
    });
  }

  return suggestions.slice(0, 4);
}
