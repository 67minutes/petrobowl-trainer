// XP → level curve. Pure math, no side effects. The SRS is unaffected by any of this.

export type LevelInfo = {
  level: number;
  xpIntoLevel: number; // XP earned since reaching the current level
  xpForNextLevel: number; // XP span of the current level (threshold(next) - threshold(current))
};

// Cumulative XP required to *reach* a given level.
// T(1) = 0, and each level costs 75 more XP than the previous one: T(L) = 75 * L*(L-1)/2.
// L2≈75, L5≈750, L10≈3375, L20≈14250.
export function xpToReach(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return (75 * l * (l - 1)) / 2;
}

export function levelForXp(xp: number): LevelInfo {
  const safeXp = Math.max(0, Math.floor(xp));
  let level = 1;
  while (xpToReach(level + 1) <= safeXp) {
    level += 1;
  }
  const currentThreshold = xpToReach(level);
  const nextThreshold = xpToReach(level + 1);
  return {
    level,
    xpIntoLevel: safeXp - currentThreshold,
    xpForNextLevel: nextThreshold - currentThreshold
  };
}
