export type PlayerRole = "admin" | "player";
export type SessionStatus = "draft" | "active" | "completed";
export type DatabaseSessionTopicMode = "topics" | "player_assigned" | "player_assigned_plus";
export type SessionTopicSource = "manual" | "assigned" | "extra" | "legacy";

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

export type Session = {
  id: string;
  team_id: string;
  name: string;
  created_by: string;
  num_questions: number;
  status: SessionStatus;
  topic_mode: DatabaseSessionTopicMode;
  created_at: string;
  completed_at: string | null;
};

export type SessionParticipant = {
  session_id: string;
  player_id: string;
  created_at: string;
};

export type SessionTopic = {
  session_id: string;
  topic_id: string;
  source: SessionTopicSource;
  created_at: string;
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

// Gamification (migration 0009). Derived from drill_responses/card_progress; never alters the SRS.
export type PlayerGamification = {
  player_id: string;
  xp: number;
  level: number;
  coins: number;
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null;
  current_combo: number;
  streak_freezes: number;
  updated_at: string;
};

export type DailyQuest = {
  id: string;
  player_id: string;
  quest_date: string;
  quest_key: string;
  target: number;
  progress: number;
  reward_xp: number;
  reward_coins: number;
  completed_at: string | null;
  created_at: string;
};

export type PlayerAchievement = {
  id: string;
  player_id: string;
  achievement_key: string;
  unlocked_at: string;
};

export type CosmeticSlot = "theme" | "sound" | "mascot" | "frame" | "badge";

export type PlayerCosmetic = {
  id: string;
  player_id: string;
  cosmetic_key: string;
  slot: CosmeticSlot;
  equipped: boolean;
  acquired_at: string;
};

export type TeamChallenge = {
  id: string;
  team_id: string;
  week_start: string;
  challenge_key: string;
  target: number;
  reward_xp: number;
  reward_coins: number;
  completed_at: string | null;
  rewarded_player_ids: string[];
  created_at: string;
};
