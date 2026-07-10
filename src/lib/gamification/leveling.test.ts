import { describe, expect, it } from "vitest";
import { levelForXp, xpToReach } from "@/lib/gamification/leveling";

describe("xpToReach", () => {
  it("uses the 75*L*(L-1)/2 curve", () => {
    expect(xpToReach(1)).toBe(0);
    expect(xpToReach(2)).toBe(75);
    expect(xpToReach(5)).toBe(750);
    expect(xpToReach(10)).toBe(3375);
  });
});

describe("levelForXp", () => {
  it("starts at level 1 with zero xp", () => {
    const info = levelForXp(0);
    expect(info.level).toBe(1);
    expect(info.xpIntoLevel).toBe(0);
    expect(info.xpForNextLevel).toBe(75);
  });

  it("levels up exactly at the threshold", () => {
    expect(levelForXp(74).level).toBe(1);
    expect(levelForXp(75).level).toBe(2);
    expect(levelForXp(749).level).toBe(4);
    expect(levelForXp(750).level).toBe(5);
  });

  it("reports progress within the current level", () => {
    const info = levelForXp(100); // level 2 starts at 75, level 3 at 225
    expect(info.level).toBe(2);
    expect(info.xpIntoLevel).toBe(25);
    expect(info.xpForNextLevel).toBe(150);
  });

  it("never returns a level below 1 for negative xp", () => {
    expect(levelForXp(-500).level).toBe(1);
  });
});
