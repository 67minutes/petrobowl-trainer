import type { PlayerRole } from "@/types/database";

export const TEAM_NAME = "SPE ITB 2026";
export const DAILY_NEW_CARD_LIMIT = 100;

export const GLOSSARY_TOPICS: { slug: string; name: string }[] = [
  { slug: "digital", name: "Digital" },
  { slug: "drilling", name: "Drilling" },
  { slug: "drilling_fluids", name: "Drilling Fluids" },
  { slug: "enhanced_oil_recovery", name: "Enhanced Oil Recovery" },
  { slug: "formation_evaluation", name: "Formation Evaluation" },
  { slug: "general_terms", name: "General Terms" },
  { slug: "geochemistry", name: "Geochemistry" },
  { slug: "geology", name: "Geology" },
  { slug: "geophysics", name: "Geophysics" },
  { slug: "heavy_oil", name: "Heavy Oil" },
  { slug: "oil_and_gas_business", name: "Oil and Gas Business" },
  { slug: "perforating", name: "Perforating" },
  { slug: "production", name: "Production" },
  { slug: "production_facilities", name: "Production Facilities" },
  { slug: "production_logging", name: "Production Logging" },
  { slug: "production_testing", name: "Production Testing" },
  { slug: "reservoir_characterization", name: "Reservoir Characterization" },
  { slug: "shale_gas", name: "Shale Gas" },
  { slug: "well_completions", name: "Well Completions" },
  { slug: "well_testing", name: "Well Testing" },
  { slug: "well_workover_and_intervention", name: "Well Workover and Intervention" }
];

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
      "Shale Gas",
      "Reservoir Characterization",
      "Digital",
      "Geochemistry",
      "General Terms",
      "Well Completions",
      "Well Workover and Intervention"
    ]
  },
  {
    name: "Anggitya",
    role: "player",
    topics: [
      "Production Facilities",
      "Production Logging",
      "Heavy Oil",
      "Production",
      "Perforating",
      "Production Testing",
      "Well Workover and Intervention"
    ]
  },
  {
    name: "Steven",
    role: "player",
    topics: ["Well Testing", "Formation Evaluation", "Drilling Fluids", "Enhanced Oil Recovery"]
  },
  {
    name: "Jak",
    role: "player",
    topics: ["Geology", "Geophysics", "Drilling", "Oil and Gas Business"]
  }
];

// Topic name -> list of owner player names (multi-owner aware).
export const TOPIC_OWNERS = SEED_PLAYERS.reduce<Record<string, string[]>>((owners, player) => {
  for (const topic of player.topics) {
    owners[topic] = [...(owners[topic] ?? []), player.name];
  }
  return owners;
}, {});
