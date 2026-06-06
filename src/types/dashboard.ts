export type DashboardPlayerRow = {
  id: string;
  name: string;
  role: "admin" | "player";
  topicCount: number;
  assignedQuestions: number;
  mastered: number;
  dueToday: number;
  reviewedToday: number;
};

export type DashboardWeakSpot = {
  questionId: string;
  term: string;
  topic: string;
  ease: number;
  agains: number;
};

export type DashboardData = {
  activePlayerId: string;
  teamName: string;
  dailyNewCardLimit: number;
  totalQuestions: number;
  unownedQuestions: number;
  players: DashboardPlayerRow[];
  activity: { day: number; count: number }[];
  weakSpots: DashboardWeakSpot[];
};
