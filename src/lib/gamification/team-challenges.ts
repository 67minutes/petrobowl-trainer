// Weekly shared team challenge. Progress is a team aggregate that any member advances; when it
// completes, each member is rewarded once (guarded by rewarded_player_ids on the row).

export type TeamChallengeMetric = "reviews" | "correct";

export type TeamChallengeDef = {
  key: string;
  label: string;
  description: string;
  metric: TeamChallengeMetric;
  target: number;
  reward_xp: number;
  reward_coins: number;
};

export const TEAM_CHALLENGE_CATALOG: TeamChallengeDef[] = [
  {
    key: "team_reviews_500",
    label: "Team Grind",
    description: "Review 500 cards as a team this week",
    metric: "reviews",
    target: 500,
    reward_xp: 150,
    reward_coins: 30
  },
  {
    key: "team_correct_400",
    label: "Team Precision",
    description: "Log 400 correct answers as a team this week",
    metric: "correct",
    target: 400,
    reward_xp: 150,
    reward_coins: 30
  },
  {
    key: "team_reviews_1000",
    label: "Team Marathon",
    description: "Review 1,000 cards as a team this week",
    metric: "reviews",
    target: 1000,
    reward_xp: 250,
    reward_coins: 50
  }
];

// Monday (UTC) of the ISO week containing `date` (YYYY-MM-DD).
export function weekStartOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

export function weekNumberOf(weekStart: string): number {
  return Math.floor(Date.parse(`${weekStart}T00:00:00Z`) / (7 * 86_400_000));
}

export function pickWeeklyChallenge(weekStart: string): TeamChallengeDef {
  const index = weekNumberOf(weekStart) % TEAM_CHALLENGE_CATALOG.length;
  return TEAM_CHALLENGE_CATALOG[index];
}

export function challengeDef(key: string): TeamChallengeDef | undefined {
  return TEAM_CHALLENGE_CATALOG.find((c) => c.key === key);
}
