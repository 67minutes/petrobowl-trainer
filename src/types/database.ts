export type PlayerRole = "admin" | "player";
export type SessionStatus = "draft" | "active" | "completed";

export type Team = {
  id: string;
  name: string;
  created_at: string;
};

export type Player = {
  id: string;
  team_id: string;
  user_id: string | null;
  name: string;
  role: PlayerRole;
  is_player: boolean;
};

export type Topic = {
  id: string;
  team_id: string;
  name: string;
  source: string | null;
  display_order: number;
};

export type Question = {
  id: string;
  topic_id: string;
  question: string;
  answer: string;
  metadata: Record<string, unknown>;
  display_order: number;
};

export type TopicAssignment = {
  id: string;
  topic_id: string;
  player_id: string;
  assigned_at: string;
  unassigned_at: string | null;
};

export type CardProgress = {
  id: string;
  player_id: string;
  question_id: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  next_review: string;
  last_reviewed: string | null;
};
