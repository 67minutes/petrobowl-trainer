import type { PlayerScore } from "@/lib/scoring";

export type AnalyticsMetric = {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "good" | "warn";
};

export type DrillFrequencyDay = {
  date: string;
  reviews: number;
  correct: number;
  accuracy: number;
};

export type DrillFrequencyWeek = {
  label: string;
  startDate: string;
  endDate: string;
  reviews: number;
  correct: number;
  accuracy: number;
};

export type WeakTopic = {
  topicId: string;
  topic: string;
  assignedQuestions: number;
  seenQuestions: number;
  dueCount: number;
  masteredCount: number;
  reviews: number;
  againCount: number;
  slowCount: number;
  averageEase: number;
  accuracy: number;
  weaknessScore: number;
};

export type AnalyticsSuggestion = {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  detail: string;
  topicId?: string;
  mode?: "smart" | "due" | "weak" | "new";
};

export type AnalyticsTeamPlayer = {
  id: string;
  name: string;
  assignedQuestions: number;
  mastered: number;
  dueToday: number;
};

export type LatestSessionTopicBreakdown = {
  topic: string;
  misses: number;
  noBuzzes: number;
};

export type LatestSessionFollowUp = {
  questionId: string;
  topic: string;
  term: string;
  reason: "own-miss" | "own-no-buzz" | "incorrect-buzz";
};

export type LatestSessionAnalytics = {
  id: string;
  name: string;
  completedAt: string | null;
  questionCount: number;
  answeredCount: number;
  playerScore: PlayerScore | null;
  scores: PlayerScore[];
  topicBreakdown: LatestSessionTopicBreakdown[];
  followUps: LatestSessionFollowUp[];
};

export type AnalyticsData = {
  activePlayer: {
    id: string;
    name: string;
  };
  summary: {
    readiness: number;
    assignedQuestions: number;
    mastered: number;
    dueToday: number;
    reviewedLast7: number;
    accuracyLast7: number;
    consistencyDays: number;
    averageResponseTimeMs: number;
  };
  metrics: AnalyticsMetric[];
  drillFrequency: DrillFrequencyDay[];
  weeklyDrill: DrillFrequencyWeek[];
  weakTopics: WeakTopic[];
  suggestions: AnalyticsSuggestion[];
  latestSession: LatestSessionAnalytics | null;
  team: {
    players: AnalyticsTeamPlayer[];
  };
};
