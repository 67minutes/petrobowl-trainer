"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Award,
  Coins,
  Flame,
  Lock,
  Snowflake,
  Sparkles,
  Trophy,
  Users,
  Volume2,
  VolumeX
} from "lucide-react";
import { clsx } from "clsx";
import { useAuth } from "@/components/auth/auth-provider";
import { useGamification } from "@/components/gamification/gamification-provider";
import { cosmeticDef } from "@/lib/gamification/cosmetics-catalog";
import { FREEZE_COST } from "@/lib/gamification/shop-constants";
import type {
  AchievementView,
  CosmeticView,
  GamificationMe,
  Leaderboard,
  QuestView,
  TeamChallengeView
} from "@/types/gamification";
import type { CosmeticSlot } from "@/types/database";

const SLOT_LABEL: Record<CosmeticSlot, string> = {
  theme: "Themes",
  sound: "Sound packs",
  mascot: "Mascots",
  frame: "Card frames",
  badge: "Badges"
};

const SLOT_ORDER: CosmeticSlot[] = ["theme", "sound", "mascot", "frame", "badge"];

export function RewardsContent() {
  const { session } = useAuth();
  const { me, loading, refresh, soundOn, volume, setSoundOn, setVolume } = useGamification();
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = session?.access_token;

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const response = await fetch("/api/gamification/leaderboard", {
          headers: { Authorization: `Bearer ${token}` }
        });
        const payload = (await response.json()) as { data?: Leaderboard };
        if (response.ok && payload.data) setLeaderboard(payload.data);
      } catch {
        /* best-effort */
      }
    })();
  }, [token, me?.state.xp]);

  const doShop = useCallback(
    async (body: { action: "buy" | "equip" | "buyFreeze"; cosmeticKey?: string }) => {
      if (!token) return;
      setBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/gamification/shop", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const payload = (await response.json()) as { error?: unknown };
        if (!response.ok) {
          throw new Error(typeof payload.error === "string" ? payload.error : "Action failed.");
        }
        await refresh();
      } catch (shopError) {
        setError(shopError instanceof Error ? shopError.message : "Action failed.");
      } finally {
        setBusy(false);
      }
    },
    [token, refresh]
  );

  if (loading && !me) {
    return (
      <section className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">Loading your arcade…</h2>
      </section>
    );
  }

  if (!me) {
    return (
      <section className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">No rewards yet</h2>
        <p className="mt-2 text-sm text-ink-500">Complete a drill to start earning XP.</p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <ProfileHeader me={me} soundOn={soundOn} volume={volume} setSoundOn={setSoundOn} setVolume={setVolume} />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <QuestsCard quests={me.quests} />
        <ChallengeCard challenge={me.challenge} />
      </div>

      <LeaderboardCard leaderboard={leaderboard} />
      <AchievementsCard achievements={me.achievements} />
      <ShopCard
        cosmetics={me.cosmetics}
        coins={me.state.coins}
        freezes={me.state.streakFreezes}
        busy={busy}
        onBuy={(key) => doShop({ action: "buy", cosmeticKey: key })}
        onEquip={(key) => doShop({ action: "equip", cosmeticKey: key })}
        onBuyFreeze={() => doShop({ action: "buyFreeze" })}
      />
    </div>
  );
}

function ProfileHeader({
  me,
  soundOn,
  volume,
  setSoundOn,
  setVolume
}: {
  me: GamificationMe;
  soundOn: boolean;
  volume: number;
  setSoundOn: (on: boolean) => void;
  setVolume: (v: number) => void;
}) {
  const { level, xpIntoLevel, xpForNextLevel, coins, currentStreak, longestStreak, streakFreezes, totalMastered, totalReviews } =
    me.state;
  const pct = xpForNextLevel > 0 ? Math.min(100, (xpIntoLevel / xpForNextLevel) * 100) : 0;

  return (
    <section className="surface rounded p-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-ink-900 text-xl font-extrabold text-white shadow-glow">
            {level}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-petrol-600">Level {level}</p>
            <div className="mt-2 h-2.5 w-52 max-w-full overflow-hidden rounded-full bg-ink-200">
              <div className="xp-fill animate-shimmer h-full rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-xs text-ink-500">
              {xpIntoLevel} / {xpForNextLevel} XP to level {level + 1}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSoundOn(!soundOn)}
            className="focus-ring inline-flex items-center gap-2 rounded border border-ink-200 bg-white px-3 py-2 text-sm text-ink-700 transition hover:border-petrol-500"
            title={soundOn ? "Mute sounds" : "Unmute sounds"}
          >
            {soundOn ? <Volume2 aria-hidden className="h-4 w-4" /> : <VolumeX aria-hidden className="h-4 w-4" />}
            {soundOn ? "Sound on" : "Muted"}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-label="Sound volume"
            className="w-24"
          />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={<Flame className="h-5 w-5 text-flame-600" />} value={currentStreak} label={`Streak (best ${longestStreak})`} />
        <StatTile icon={<Coins className="h-5 w-5 text-gold-600" />} value={coins} label="Coins" />
        <StatTile icon={<Snowflake className="h-5 w-5 text-petrol-600" />} value={streakFreezes} label="Streak freezes" />
        <StatTile icon={<Sparkles className="h-5 w-5 text-combo-600" />} value={totalMastered} label={`Mastered · ${totalReviews} reviews`} />
      </div>
    </section>
  );
}

function StatTile({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="rounded border border-ink-200 bg-white p-4">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-2xl font-extrabold text-ink-900">{value}</span>
      </div>
      <p className="mt-1 text-xs text-ink-500">{label}</p>
    </div>
  );
}

function QuestsCard({ quests }: { quests: QuestView[] }) {
  return (
    <section className="rounded border border-ink-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Sparkles aria-hidden className="h-4 w-4 text-combo-600" />
        <h2 className="text-sm font-semibold text-ink-900">Today&apos;s quests</h2>
      </div>
      <div className="mt-4 space-y-4">
        {quests.map((quest) => {
          const pct = Math.min(100, (quest.progress / quest.target) * 100);
          return (
            <div key={quest.key}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className={clsx("font-medium", quest.completed ? "text-combo-600" : "text-ink-800")}>
                  {quest.completed ? "✓ " : ""}
                  {quest.description}
                </span>
                <span className="shrink-0 text-xs font-semibold text-gold-600">+{quest.reward_xp} XP</span>
              </div>
              <div className="h-2 rounded bg-ink-200">
                <div
                  className={clsx("h-2 rounded transition-all", quest.completed ? "bg-combo-500" : "game-accent-bg")}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-ink-500">
                {Math.min(quest.progress, quest.target)} / {quest.target}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ChallengeCard({ challenge }: { challenge: TeamChallengeView | null }) {
  if (!challenge) {
    return (
      <section className="rounded border border-ink-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-ink-900">Weekly team challenge</h2>
        <p className="mt-2 text-sm text-ink-500">No active challenge.</p>
      </section>
    );
  }
  const pct = Math.min(100, (challenge.progress / challenge.target) * 100);
  return (
    <section className="rounded border border-ink-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Users aria-hidden className="h-4 w-4 text-petrol-600" />
        <h2 className="text-sm font-semibold text-ink-900">Weekly team challenge</h2>
      </div>
      <p className="mt-3 text-base font-semibold text-ink-900">{challenge.label}</p>
      <p className="text-sm text-ink-500">{challenge.description}</p>
      <div className="mt-3 h-2.5 rounded bg-ink-200">
        <div
          className={clsx("h-2.5 rounded transition-all", challenge.completed ? "bg-combo-500" : "bg-flame-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-ink-500">
          {challenge.progress} / {challenge.target}
        </span>
        <span className="font-semibold text-gold-600">
          {challenge.completed ? "Complete!" : `Reward +${challenge.reward_xp} XP each`}
        </span>
      </div>
    </section>
  );
}

function LeaderboardCard({ leaderboard }: { leaderboard: Leaderboard | null }) {
  return (
    <section className="rounded border border-ink-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Trophy aria-hidden className="h-4 w-4 text-gold-600" />
        <h2 className="text-sm font-semibold text-ink-900">Team leaderboard</h2>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-ink-500">
              <th className="pb-2 pr-3 font-semibold">#</th>
              <th className="pb-2 pr-3 font-semibold">Player</th>
              <th className="pb-2 pr-3 text-right font-semibold">Level</th>
              <th className="pb-2 pr-3 text-right font-semibold">XP</th>
              <th className="pb-2 pr-3 text-right font-semibold">Streak</th>
              <th className="pb-2 text-right font-semibold">Week</th>
            </tr>
          </thead>
          <tbody>
            {(leaderboard?.entries ?? []).map((entry, index) => (
              <tr
                key={entry.playerId}
                className={clsx("border-t border-ink-100", entry.isSelf && "bg-petrol-500/5 font-semibold")}
              >
                <td className="py-2 pr-3">{index + 1}</td>
                <td className="py-2 pr-3">
                  {entry.name}
                  {entry.isSelf ? <span className="ml-1 text-xs text-petrol-600">(you)</span> : null}
                </td>
                <td className="py-2 pr-3 text-right">{entry.level}</td>
                <td className="py-2 pr-3 text-right">{entry.xp.toLocaleString()}</td>
                <td className="py-2 pr-3 text-right">{entry.currentStreak}🔥</td>
                <td className="py-2 text-right">
                  {entry.weekReviews} · {Math.round(entry.weekAccuracy * 100)}%
                </td>
              </tr>
            ))}
            {!leaderboard || leaderboard.entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-4 text-center text-sm text-ink-500">
                  No leaderboard data yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AchievementsCard({ achievements }: { achievements: AchievementView[] }) {
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  return (
    <section className="rounded border border-ink-200 bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Award aria-hidden className="h-4 w-4 text-gold-600" />
          <h2 className="text-sm font-semibold text-ink-900">Achievements</h2>
        </div>
        <span className="text-xs text-ink-500">
          {unlockedCount} / {achievements.length}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {achievements.map((achievement) => (
          <div
            key={achievement.key}
            className={clsx(
              "rounded border p-3",
              achievement.unlocked ? "border-gold-400 bg-gold-500/10" : "border-ink-200 bg-white opacity-70"
            )}
          >
            <div className="flex items-center gap-2">
              {achievement.unlocked ? (
                <Award aria-hidden className="h-4 w-4 text-gold-600" />
              ) : (
                <Lock aria-hidden className="h-4 w-4 text-ink-400" />
              )}
              <p className="text-sm font-semibold text-ink-900">{achievement.label}</p>
            </div>
            <p className="mt-1 text-xs text-ink-500">{achievement.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ShopCard({
  cosmetics,
  coins,
  freezes,
  busy,
  onBuy,
  onEquip,
  onBuyFreeze
}: {
  cosmetics: CosmeticView[];
  coins: number;
  freezes: number;
  busy: boolean;
  onBuy: (key: string) => void;
  onEquip: (key: string) => void;
  onBuyFreeze: () => void;
}) {
  return (
    <section className="rounded border border-ink-200 bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Coins aria-hidden className="h-4 w-4 text-gold-600" />
          <h2 className="text-sm font-semibold text-ink-900">Shop</h2>
        </div>
        <span className="text-sm font-semibold text-gold-600">{coins} coins</span>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded border border-petrol-500/30 bg-petrol-500/5 p-3">
        <div className="flex items-center gap-2">
          <Snowflake aria-hidden className="h-5 w-5 text-petrol-600" />
          <div>
            <p className="text-sm font-semibold text-ink-900">Streak freeze</p>
            <p className="text-xs text-ink-500">You have {freezes}. Protects a missed day.</p>
          </div>
        </div>
        <button
          type="button"
          disabled={busy || coins < FREEZE_COST}
          onClick={onBuyFreeze}
          className="focus-ring rounded bg-petrol-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-petrol-500 disabled:opacity-40"
        >
          Buy · {FREEZE_COST}
        </button>
      </div>

      <div className="mt-5 space-y-5">
        {SLOT_ORDER.map((slot) => {
          const items = cosmetics.filter((c) => c.slot === slot);
          if (items.length === 0) return null;
          return (
            <div key={slot}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">{SLOT_LABEL[slot]}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {items.map((cosmetic) => (
                  <CosmeticRow
                    key={cosmetic.key}
                    cosmetic={cosmetic}
                    coins={coins}
                    busy={busy}
                    onBuy={onBuy}
                    onEquip={onEquip}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CosmeticRow({
  cosmetic,
  coins,
  busy,
  onBuy,
  onEquip
}: {
  cosmetic: CosmeticView;
  coins: number;
  busy: boolean;
  onBuy: (key: string) => void;
  onEquip: (key: string) => void;
}) {
  const canEquip = cosmetic.owned || cosmetic.unlockedByProgress;
  const def = cosmeticDef(cosmetic.key);
  const lockHint =
    def?.unlock.type === "level"
      ? `Reach level ${def.unlock.level}`
      : def?.unlock.type === "achievement"
        ? "Unlock an achievement"
        : null;

  return (
    <div className="flex items-center justify-between gap-3 rounded border border-ink-200 p-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink-900">{cosmetic.name}</p>
        <p className="truncate text-xs text-ink-500">{cosmetic.description}</p>
      </div>
      {cosmetic.equipped ? (
        <span className="shrink-0 rounded-full bg-combo-500 px-3 py-1 text-xs font-bold text-white">Equipped</span>
      ) : canEquip ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onEquip(cosmetic.key)}
          className="focus-ring shrink-0 rounded border border-ink-300 px-3 py-1.5 text-xs font-semibold text-ink-800 transition hover:border-petrol-500 hover:text-petrol-600 disabled:opacity-40"
        >
          Equip
        </button>
      ) : cosmetic.coinCost !== null ? (
        <button
          type="button"
          disabled={busy || coins < cosmetic.coinCost}
          onClick={() => onBuy(cosmetic.key)}
          className="focus-ring shrink-0 rounded bg-gold-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-gold-600 disabled:opacity-40"
        >
          Buy · {cosmetic.coinCost}
        </button>
      ) : (
        <span className="flex shrink-0 items-center gap-1 text-xs text-ink-400">
          <Lock aria-hidden className="h-3.5 w-3.5" />
          {lockHint ?? "Locked"}
        </span>
      )}
    </div>
  );
}
