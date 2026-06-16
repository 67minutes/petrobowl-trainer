import type { PlayerScore } from "@/lib/scoring";
import type { PlayerRole, SessionStatus } from "@/types/database";

export type QuizSessionPlayer = {
  id: string;
  name: string;
  role: PlayerRole;
};

export type QuizSessionQuestion = {
  id: string;
  questionId: string;
  order: number;
  question: string;
  answer: string;
  assignedTo: string | null;
  assignedToName: string | null;
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
