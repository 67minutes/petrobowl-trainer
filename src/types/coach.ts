import type { PlayerRole } from "@/types/database";

export type QuadrantLabel = "anchor" | "stealer" | "liability" | "balanced";

export type TopicStrengthCell = {
  topicId: string;
  blended: number;
  studyAccuracy: number;
  studySamples: number;
  buzzAccuracy: number;
  buzzSamples: number;
  owned: boolean;
  thinData: boolean;
};

export type PlayerReadiness = {
  assignedQuestions: number;
  mastered: number;
  masteryPct: number;
  dueBacklog: number;
  consistencyDays: number;
  accuracyLast7: number;
  accuracyTrend: "up" | "down" | "flat";
};

export type SpeedProfile = {
  samples: number;
  minMs: number;
  medianMs: number;
  maxMs: number;
};

export type OffenseDefense = {
  onTopic: number;
  outOfTopic: number;
  missedTopic: number;
  wrongBuzzes: number;
  ownQuestions: number;
  otherQuestions: number;
  defenseScore: number;
  offenseBonus: number;
  totalScore: number;
  label: QuadrantLabel;
};

export type CoachPlayer = {
  id: string;
  name: string;
  readiness: PlayerReadiness;
  speed: SpeedProfile;
  offenseDefense: OffenseDefense;
  topicStrength: TopicStrengthCell[];
};

export type CoachTopic = {
  id: string;
  name: string;
};

export type CoachData = {
  viewer: {
    id: string;
    role: PlayerRole;
  };
  topics: CoachTopic[];
  players: CoachPlayer[];
};
