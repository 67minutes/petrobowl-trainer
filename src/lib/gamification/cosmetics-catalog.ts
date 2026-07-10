// Static cosmetic catalog. Cosmetics never affect the SRS or scoring — purely visual/audio flavor.
// Unlocks are either free-by-progress (default / level / achievement) or purchasable with coins.

import type { CosmeticSlot } from "@/types/database";

export type CosmeticUnlock =
  | { type: "default" }
  | { type: "level"; level: number }
  | { type: "coins"; cost: number }
  | { type: "achievement"; achievementKey: string };

export type CosmeticDef = {
  key: string;
  slot: CosmeticSlot;
  name: string;
  description: string;
  unlock: CosmeticUnlock;
};

export const COSMETIC_CATALOG: CosmeticDef[] = [
  // Themes — swap accent color tokens.
  { key: "theme_default", slot: "theme", name: "Petrol", description: "The classic sky-blue look", unlock: { type: "default" } },
  { key: "theme_neon", slot: "theme", name: "Neon Arcade", description: "Electric magenta + cyan", unlock: { type: "coins", cost: 150 } },
  { key: "theme_midnight", slot: "theme", name: "Midnight", description: "Deep indigo night mode", unlock: { type: "level", level: 10 } },
  { key: "theme_sunset", slot: "theme", name: "Sunset", description: "Warm amber + coral", unlock: { type: "coins", cost: 250 } },

  // Sound packs — change synth waveform/tuning.
  { key: "sound_arcade", slot: "sound", name: "Arcade", description: "Bright retro bleeps", unlock: { type: "default" } },
  { key: "sound_chiptune", slot: "sound", name: "Chiptune", description: "8-bit square-wave tones", unlock: { type: "coins", cost: 120 } },
  { key: "sound_soft", slot: "sound", name: "Soft", description: "Gentle sine-wave chimes", unlock: { type: "level", level: 5 } },

  // Mascots — a buddy shown on the drill card + celebrations.
  { key: "mascot_rocky", slot: "mascot", name: "Rocky", description: "The roughneck", unlock: { type: "default" } },
  { key: "mascot_bit", slot: "mascot", name: "Bit", description: "The drill bit", unlock: { type: "level", level: 8 } },
  { key: "mascot_derrick", slot: "mascot", name: "Derrick", description: "The rig", unlock: { type: "coins", cost: 200 } },

  // Card frames — border style around the drill card.
  { key: "frame_bronze", slot: "frame", name: "Bronze", description: "Starter frame", unlock: { type: "default" } },
  { key: "frame_silver", slot: "frame", name: "Silver", description: "Polished frame", unlock: { type: "level", level: 5 } },
  { key: "frame_gold", slot: "frame", name: "Gold", description: "Prestige frame", unlock: { type: "level", level: 15 } },
  { key: "frame_plasma", slot: "frame", name: "Plasma", description: "Animated glow frame", unlock: { type: "coins", cost: 400 } },

  // Badges — worn on the profile / leaderboard.
  { key: "badge_rookie", slot: "badge", name: "Rookie", description: "Everyone starts here", unlock: { type: "default" } },
  { key: "badge_scholar", slot: "badge", name: "Scholar", description: "500 reviews", unlock: { type: "achievement", achievementKey: "reviews_500" } },
  { key: "badge_legend", slot: "badge", name: "Legend", description: "30-day streak", unlock: { type: "achievement", achievementKey: "streak_30" } }
];

const CATALOG_BY_KEY = new Map(COSMETIC_CATALOG.map((c) => [c.key, c]));

export function cosmeticDef(key: string): CosmeticDef | undefined {
  return CATALOG_BY_KEY.get(key);
}

export const DEFAULT_COSMETICS = COSMETIC_CATALOG.filter((c) => c.unlock.type === "default").map(
  (c) => c.key
);

export function cosmeticCoinCost(def: CosmeticDef): number | null {
  return def.unlock.type === "coins" ? def.unlock.cost : null;
}

// Whether a cosmetic is available for free based on progress (default/level/achievement).
// Coin-cost cosmetics return false here — they must be bought in the shop.
export function isUnlockedByProgress(
  def: CosmeticDef,
  progress: { level: number; achievements: Set<string> }
): boolean {
  switch (def.unlock.type) {
    case "default":
      return true;
    case "level":
      return progress.level >= def.unlock.level;
    case "achievement":
      return progress.achievements.has(def.unlock.achievementKey);
    case "coins":
      return false;
    default:
      return false;
  }
}
