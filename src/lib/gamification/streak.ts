// Daily streak logic with streak-freeze protection. An "active day" is any day with >= 1 review.
// Pure: given the stored streak state and today's date (YYYY-MM-DD), returns the next state.

export type StreakState = {
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null; // 'YYYY-MM-DD'
  streak_freezes: number;
};

export type StreakResult = StreakState & {
  awardedFreeze: boolean;
  usedFreeze: boolean;
  incremented: boolean;
};

// Grant a bonus freeze each time the streak reaches a multiple of this.
export const FREEZE_MILESTONE = 7;

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function applyStreak(state: StreakState, today: string): StreakResult {
  const noChange: StreakResult = {
    ...state,
    awardedFreeze: false,
    usedFreeze: false,
    incremented: false
  };

  // Already counted today, or a clock that reports an earlier day than last activity.
  if (state.last_active_date !== null && daysBetween(state.last_active_date, today) <= 0) {
    return noChange;
  }

  let current = state.current_streak;
  let freezes = state.streak_freezes;
  let usedFreeze = false;

  if (state.last_active_date === null) {
    current = 1;
  } else {
    const gap = daysBetween(state.last_active_date, today);
    if (gap === 1) {
      current += 1; // consecutive day
    } else {
      const missed = gap - 1; // fully-missed days between last activity and today
      if (freezes >= missed) {
        freezes -= missed;
        usedFreeze = true;
        current += 1; // streak preserved
      } else {
        current = 1; // reset
      }
    }
  }

  let awardedFreeze = false;
  if (current > state.current_streak && current % FREEZE_MILESTONE === 0) {
    freezes += 1;
    awardedFreeze = true;
  }

  return {
    current_streak: current,
    longest_streak: Math.max(state.longest_streak, current),
    last_active_date: today,
    streak_freezes: freezes,
    awardedFreeze,
    usedFreeze,
    incremented: true
  };
}
