import type { PlayerRole } from "@/types/database";

export const TEAM_NAME = "SPE ITB 2026";
export const DAILY_NEW_CARD_LIMIT = 30;

export type SeedPlayer = {
  name: string;
  role: PlayerRole;
  topics: string[];
};

export const SEED_PLAYERS: SeedPlayer[] = [
  {
    name: "Maulidan",
    role: "admin",
    topics: [
      "Machine Learning (GPT)",
      "Shale Gas",
      "Reservoir Characterization",
      "The Prize",
      "Renewables (GPT)"
    ]
  },
  {
    name: "Anggitya",
    role: "player",
    topics: [
      "Production Facilities",
      "Production Logging",
      "Heavy Oil",
      "Well Intervention",
      "Production",
      "Perforating",
      "Production Test",
      "Well Completion"
    ]
  },
  {
    name: "Steven",
    role: "player",
    topics: ["Well Test", "Form Evaluation", "Drilling Fluid", "EOR"]
  },
  {
    name: "Jak",
    role: "player",
    topics: ["Geology", "Geophysics", "Drilling", "OnG Business"]
  }
];

export const UNOWNED_TOPICS = ["Renewables (IEA + EIA)"];

export const TOPIC_ASSIGNMENTS = SEED_PLAYERS.reduce<Record<string, string>>(
  (assignments, player) => {
    for (const topic of player.topics) {
      assignments[topic] = player.name;
    }
    return assignments;
  },
  {}
);
