"use client";

import Link from "next/link";
import { Coins, Flame } from "lucide-react";
import { useGamification } from "@/components/gamification/gamification-provider";

export function XpHud() {
  const { me } = useGamification();
  if (!me) return null;

  const { level, xpIntoLevel, xpForNextLevel, coins, currentStreak } = me.state;
  const pct = xpForNextLevel > 0 ? Math.min(100, (xpIntoLevel / xpForNextLevel) * 100) : 0;

  return (
    <Link
      href="/rewards"
      className="focus-ring group flex items-center gap-3 rounded-full border border-ink-200 bg-white/80 px-2 py-1.5 pr-3 transition hover:border-petrol-500"
      title="Level, XP, streak & rewards"
    >
      <span className="animate-pulse-ring grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink-900 text-xs font-bold text-white">
        {level}
      </span>

      <span className="hidden w-24 sm:block">
        <span className="mb-1 flex items-center justify-between text-[10px] font-semibold text-ink-500">
          <span>Lvl {level}</span>
          <span>
            {xpIntoLevel}/{xpForNextLevel}
          </span>
        </span>
        <span className="block h-1.5 w-full overflow-hidden rounded-full bg-ink-200">
          <span className="xp-fill animate-shimmer block h-full rounded-full" style={{ width: `${pct}%` }} />
        </span>
      </span>

      <span className="flex items-center gap-1 text-sm font-bold text-flame-600" title={`${currentStreak}-day streak`}>
        <Flame aria-hidden className="h-4 w-4" />
        {currentStreak}
      </span>

      <span className="flex items-center gap-1 text-sm font-bold text-gold-600" title={`${coins} coins`}>
        <Coins aria-hidden className="h-4 w-4" />
        {coins}
      </span>
    </Link>
  );
}
