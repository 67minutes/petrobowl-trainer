import { DAILY_NEW_CARD_LIMIT, SEED_PLAYERS, TEAM_NAME, UNOWNED_TOPICS } from "@/lib/constants";
import { calculateSessionScores } from "@/lib/scoring";

export const demoPlayers = SEED_PLAYERS.map((player, index) => ({
  id: `player-${index + 1}`,
  name: player.name,
  role: player.role,
  topics: player.topics,
  assignedQuestions: [1497, 1276, 1572, 1687][index],
  mastered: [612, 438, 701, 664][index],
  dueToday: [44, 38, 55, 47][index],
  reviewedToday: [28, 19, 31, 24][index]
}));

export const demoTeam = {
  name: TEAM_NAME,
  totalQuestions: 6996,
  unownedTopics: UNOWNED_TOPICS,
  dailyNewCardLimit: DAILY_NEW_CARD_LIMIT
};

export const demoActivity = Array.from({ length: 35 }, (_, index) => ({
  day: index + 1,
  count: [0, 4, 12, 24, 31, 0, 7][index % 7] + (index % 3) * 2
}));

export const demoWeakSpots = [
  { term: "Capillary pressure", topic: "Reservoir Characterization", ease: 1.35, agains: 4 },
  { term: "Foam drilling fluid", topic: "Drilling Fluid", ease: 1.42, agains: 3 },
  { term: "ESP gas lock", topic: "Production", ease: 1.48, agains: 3 }
];

export const demoSessionQuestions = [
  { id: "q1", assignedTo: "player-1", buzzedBy: "player-1", correct: true },
  { id: "q2", assignedTo: "player-2", buzzedBy: "player-3", correct: true },
  { id: "q3", assignedTo: "player-3", buzzedBy: null, correct: false },
  { id: "q4", assignedTo: "player-4", buzzedBy: "player-4", correct: true },
  { id: "q5", assignedTo: null, buzzedBy: "player-2", correct: true }
];

export const demoScores = calculateSessionScores(demoPlayers, demoSessionQuestions);
