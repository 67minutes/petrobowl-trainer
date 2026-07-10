// Daily quests. Three are picked deterministically per player per day, and progress is computed
// from that day's cumulative aggregates (so it is monotonic and self-healing).

export type QuestKey =
  | "reviews_20"
  | "reviews_40"
  | "correct_15"
  | "correct_30"
  | "topics_3"
  | "combo_10";

export type QuestDef = {
  key: QuestKey;
  label: string;
  description: string;
  target: number;
  reward_xp: number;
  reward_coins: number;
};

export const QUEST_CATALOG: QuestDef[] = [
  { key: "reviews_20", label: "Warm-up", description: "Review 20 cards", target: 20, reward_xp: 40, reward_coins: 8 },
  { key: "reviews_40", label: "Grinder", description: "Review 40 cards", target: 40, reward_xp: 70, reward_coins: 15 },
  { key: "correct_15", label: "Sharp shooter", description: "Answer 15 correctly", target: 15, reward_xp: 40, reward_coins: 8 },
  { key: "correct_30", label: "On fire", description: "Answer 30 correctly", target: 30, reward_xp: 70, reward_coins: 15 },
  { key: "topics_3", label: "Well-rounded", description: "Drill 3 different topics", target: 3, reward_xp: 30, reward_coins: 6 },
  { key: "combo_10", label: "Combo master", description: "Reach a 10-answer combo", target: 10, reward_xp: 50, reward_coins: 12 }
];

const CATALOG_BY_KEY = new Map(QUEST_CATALOG.map((quest) => [quest.key, quest]));

export function questDef(key: QuestKey): QuestDef | undefined {
  return CATALOG_BY_KEY.get(key);
}

// That day's cumulative counters for the player.
export type DailyAggregate = {
  reviews: number;
  correct: number;
  distinctTopics: number;
  maxCombo: number;
};

// Deterministic shuffle (mulberry32) so a player sees a stable set of quests for a given day.
function seededPick(seed: number, count: number): QuestDef[] {
  let state = seed >>> 0;
  const pool = [...QUEST_CATALOG];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const rand = ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    const j = Math.floor(rand * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

// dayNumber is days-since-epoch (or any stable integer for the date); playerSeed keeps players
// on different rotations.
export function pickDailyQuests(dayNumber: number, playerSeed: number, count = 3): QuestDef[] {
  return seededPick((dayNumber * 2_654_435_761 + playerSeed) >>> 0, count);
}

// Absolute progress toward a quest given the day's aggregates (caller clamps with max()).
export function questProgress(key: QuestKey, agg: DailyAggregate): number {
  switch (key) {
    case "reviews_20":
      return Math.min(agg.reviews, 20);
    case "reviews_40":
      return Math.min(agg.reviews, 40);
    case "correct_15":
      return Math.min(agg.correct, 15);
    case "correct_30":
      return Math.min(agg.correct, 30);
    case "topics_3":
      return Math.min(agg.distinctTopics, 3);
    case "combo_10":
      return Math.min(agg.maxCombo, 10);
    default:
      return 0;
  }
}

export function dayNumberFromDate(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

// Stable per-player integer used to keep players on different quest rotations.
export function seedFromPlayerId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0;
  }
  return h;
}
