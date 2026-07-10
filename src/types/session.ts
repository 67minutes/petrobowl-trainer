import type { PlayerScore } from "@/lib/scoring";
import type { PlayerRole, SessionStatus } from "@/types/database";
import type { SessionTopicMode } from "@/lib/session-pool";

export type QuizSessionPlayer = {
  id: string;
  name: string;
  role: PlayerRole;
};

export type QuizSessionQuestion = {
  id: string;
  questionId: string;
  order: number;
  topicId: string | null;
  topicName: string | null;
  question: string;
  answer: string;
  acceptedAnswers: string[];
  assignedTo: string | null;
  assignedToName: string | null;
  owners: string[];
  ownerNames: string[];
  buzzedBy: string | null;
  buzzedByName: string | null;
  correct: boolean;
  missedBy: string[];
  missedByNames: string[];
};

export type QuizSession = {
  id: string;
  name: string;
  status: SessionStatus;
  topicMode: SessionTopicMode;
  numQuestions: number;
  createdAt: string;
  completedAt: string | null;
  questions: QuizSessionQuestion[];
};

export type QuizSessionData = {
  players: QuizSessionPlayer[];
  scores: PlayerScore[];
  session: QuizSession | null;
};

export type SessionSetupTopic = {
  id: string;
  name: string;
  displayOrder: number;
  ownerIds: string[];
  ownerNames: string[];
  questionCount: number;
};

export type SessionSummary = {
  id: string;
  name: string;
  status: SessionStatus;
  topicMode: SessionTopicMode;
  numQuestions: number;
  createdAt: string;
  completedAt: string | null;
  participantIds: string[];
  participantNames: string[];
  topicCount: number;
};

export type SessionSetupData = {
  players: QuizSessionPlayer[];
  topics: SessionSetupTopic[];
  sessions: SessionSummary[];
};
