"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { fireConfetti } from "@/components/gamification/confetti";
import { playSound as playRawSound, primeAudio, type SoundName, type SoundPack } from "@/lib/gamification/sound";
import type { AwardSummary, GamificationMe } from "@/types/gamification";

export type FxItem =
  | { id: number; kind: "gain"; xp: number; combo: number; doubleXp: boolean }
  | { id: number; kind: "banner"; title: string; subtitle: string; tone: "level" | "mastery" }
  | { id: number; kind: "toast"; icon: "quest" | "achievement" | "freeze"; title: string; subtitle: string };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type FxInput = DistributiveOmit<FxItem, "id">;

type GamificationContextValue = {
  me: GamificationMe | null;
  loading: boolean;
  refresh: () => Promise<void>;
  applyAward: (summary: AwardSummary) => void;
  fxItems: FxItem[];
  soundOn: boolean;
  volume: number;
  setSoundOn: (on: boolean) => void;
  setVolume: (v: number) => void;
  playSound: (name: SoundName, variant?: number) => void;
};

const GamificationContext = createContext<GamificationContextValue | null>(null);

const PREFS_KEY = "pb-sound-prefs";

const SOUND_PACK_BY_KEY: Record<string, SoundPack> = {
  sound_arcade: "arcade",
  sound_chiptune: "chiptune",
  sound_soft: "soft"
};

const THEME_ATTR_BY_KEY: Record<string, string | null> = {
  theme_default: null,
  theme_neon: "neon",
  theme_midnight: "midnight",
  theme_sunset: "sunset"
};

export function GamificationProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [me, setMe] = useState<GamificationMe | null>(null);
  const [loading, setLoading] = useState(false);
  const [fxItems, setFxItems] = useState<FxItem[]>([]);
  const [soundOn, setSoundOnState] = useState(true);
  const [volume, setVolumeState] = useState(0.7);
  const fxId = useRef(0);
  const token = session?.access_token;

  // Load persisted sound prefs.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { enabled?: boolean; volume?: number };
        if (typeof parsed.enabled === "boolean") setSoundOnState(parsed.enabled);
        if (typeof parsed.volume === "number") setVolumeState(parsed.volume);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persistPrefs = useCallback((enabled: boolean, vol: number) => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ enabled, volume: vol }));
    } catch {
      /* ignore */
    }
  }, []);

  const setSoundOn = useCallback(
    (on: boolean) => {
      setSoundOnState(on);
      persistPrefs(on, volume);
    },
    [persistPrefs, volume]
  );

  const setVolume = useCallback(
    (v: number) => {
      setVolumeState(v);
      persistPrefs(soundOn, v);
    },
    [persistPrefs, soundOn]
  );

  const pack: SoundPack = SOUND_PACK_BY_KEY[me?.equipped.sound ?? "sound_arcade"] ?? "arcade";

  const playSound = useCallback(
    (name: SoundName, variant = 0) => {
      playRawSound(name, { enabled: soundOn, volume, pack }, variant);
    },
    [soundOn, volume, pack]
  );

  const refresh = useCallback(async () => {
    if (!token) {
      setMe(null);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/gamification/me", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = (await response.json()) as { data?: GamificationMe };
      if (response.ok && payload.data) {
        setMe(payload.data);
      }
    } catch {
      /* best-effort */
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Apply the equipped theme to the document root.
  useEffect(() => {
    const themeKey = me?.equipped.theme ?? "theme_default";
    const attr = THEME_ATTR_BY_KEY[themeKey] ?? null;
    if (attr) {
      document.documentElement.dataset.gameTheme = attr;
    } else {
      delete document.documentElement.dataset.gameTheme;
    }
  }, [me?.equipped.theme]);

  // Prime audio on first gesture so strict browsers allow playback.
  useEffect(() => {
    const handler = () => primeAudio();
    window.addEventListener("pointerdown", handler, { once: true });
    return () => window.removeEventListener("pointerdown", handler);
  }, []);

  const addFx = useCallback((item: FxInput, ttl: number) => {
    const id = (fxId.current += 1);
    const full = { ...item, id } as FxItem;
    setFxItems((current) => [...current, full]);
    window.setTimeout(() => {
      setFxItems((current) => current.filter((fx) => fx.id !== id));
    }, ttl);
  }, []);

  const applyAward = useCallback(
    (summary: AwardSummary) => {
      const correct = summary.combo > 0;

      // Optimistic HUD update.
      setMe((current) =>
        current
          ? {
              ...current,
              state: {
                ...current.state,
                xp: summary.totalXp,
                level: summary.level,
                coins: summary.coins,
                currentStreak: summary.streak,
                streakFreezes: summary.streakFreezes,
                combo: summary.combo,
                xpIntoLevel: summary.xpIntoLevel,
                xpForNextLevel: summary.xpForNextLevel
              }
            }
          : current
      );

      // Floating gain.
      if (summary.xpGained > 0) {
        addFx({ kind: "gain", xp: summary.xpGained, combo: summary.combo, doubleXp: summary.doubleXp }, 1000);
      }

      // Pick one primary sound cue by priority.
      if (summary.achievementsUnlocked.length > 0) {
        playSound("achievement");
      } else if (summary.leveledUp) {
        playSound("levelUp");
      } else if (summary.questsCompleted.length > 0) {
        playSound("questComplete");
      } else if (summary.masteryCrossed) {
        playSound("coin");
      } else if (summary.combo >= 2) {
        playSound("combo", summary.combo);
      } else if (correct) {
        playSound("correct");
      } else {
        playSound("error");
      }

      if (summary.masteryCrossed) {
        addFx({ kind: "banner", title: "Mastered!", subtitle: "+25 XP", tone: "mastery" }, 2200);
      }
      if (summary.leveledUp) {
        addFx({ kind: "banner", title: `Level ${summary.level}!`, subtitle: "Level up", tone: "level" }, 2600);
        fireConfetti({ particles: 150, power: 1.1 });
      }
      for (const quest of summary.questsCompleted) {
        addFx({ kind: "toast", icon: "quest", title: "Quest complete", subtitle: `${quest.label} · +${quest.reward_xp} XP` }, 3600);
      }
      for (const achievement of summary.achievementsUnlocked) {
        addFx({ kind: "toast", icon: "achievement", title: "Achievement!", subtitle: achievement.label }, 4200);
        fireConfetti({ particles: 120, power: 1 });
      }
      if (summary.awardedFreeze) {
        addFx({ kind: "toast", icon: "freeze", title: "Streak freeze earned", subtitle: "Protects a missed day" }, 3600);
      }

      // Resync authoritative quests/achievements/challenge when something notable happened.
      if (summary.leveledUp || summary.questsCompleted.length > 0 || summary.achievementsUnlocked.length > 0) {
        void refresh();
      }
    },
    [addFx, playSound, refresh]
  );

  return (
    <GamificationContext.Provider
      value={{ me, loading, refresh, applyAward, fxItems, soundOn, volume, setSoundOn, setVolume, playSound }}
    >
      {children}
    </GamificationContext.Provider>
  );
}

export function useGamification() {
  const context = useContext(GamificationContext);
  if (!context) {
    throw new Error("useGamification must be used within a GamificationProvider");
  }
  return context;
}
