export type SessionPlayer = {
  id: string;
  name: string;
};

export type ScoredSessionQuestion = {
  id: string;
  owners: string[];
  buzzedBy: string | null;
  correct: boolean;
  missedBy: string[];
  // Bonus questions score purely additively: +BONUS_POINT_VALUE for each correct
  // answer, no owner, no steal, no penalty. They are excluded from the
  // defense/offense ratio model entirely.
  isBonus?: boolean;
};

export type PlayerScore = {
  playerId: string;
  name: string;
  correctAnswers: number;
  onTopic: number;
  outOfTopic: number;
  missedTopic: number;
  wrongBuzzes: number;
  ownQuestions: number;
  otherQuestions: number;
  bonusCorrect: number;
  bonusPoints: number;
  defenseScore: number;
  offenseBonus: number;
  totalScore: number;
};

// Flat points awarded for each correctly answered bonus question. Keep in sync
// with the `session_scores` SQL view (migration 0010).
export const BONUS_POINT_VALUE = 5;

function roundScore(value: number) {
  return Math.round(value * 10) / 10;
}

export function calculateSessionScores(
  players: SessionPlayer[],
  questions: ScoredSessionQuestion[]
): PlayerScore[] {
  // The ratio model only sees owned/offense questions; bonuses are handled apart.
  const scoredQuestions = questions.filter((question) => !question.isBonus);
  const bonusQuestions = questions.filter((question) => question.isBonus);

  return players.map((player) => {
    const owns = (question: ScoredSessionQuestion) => question.owners.includes(player.id);
    const wonBy = (question: ScoredSessionQuestion) =>
      question.buzzedBy === player.id && question.correct;

    const ownQuestions = scoredQuestions.filter(owns).length;
    const otherQuestions = scoredQuestions.length - ownQuestions;

    const bonusCorrect = bonusQuestions.filter(
      (question) => question.buzzedBy === player.id && question.correct
    ).length;
    const bonusPoints = bonusCorrect * BONUS_POINT_VALUE;

    // Every correct buzz the player made, bonus questions included.
    const correctAnswers = questions.filter(
      (question) => question.buzzedBy === player.id && question.correct
    ).length;

    const onTopic = scoredQuestions.filter((question) => owns(question) && wonBy(question)).length;
    const outOfTopic = scoredQuestions.filter(
      (question) => !owns(question) && question.buzzedBy === player.id && question.correct
    ).length;

    // Non-win on an owned question (integer count, for display parity).
    const missedTopic = scoredQuestions.filter((question) => owns(question) && !wonBy(question)).length;

    // Weighted defense penalty: an owner buzzing wrong on their own topic, or a
    // co-owner taking it, is a full miss (weight 1); a steal by a non-owner or a
    // no-correct-answer outcome splits the blame across co-owners (weight 1/k).
    const missedWeight = scoredQuestions.reduce((sum, question) => {
      if (!owns(question) || wonBy(question)) {
        return sum;
      }
      const k = Math.max(question.owners.length, 1);
      const ownWrongBuzz = question.buzzedBy === player.id && !question.correct;
      const coOwnerWon =
        question.correct && question.buzzedBy !== null && question.owners.includes(question.buzzedBy);
      const weight = ownWrongBuzz || coOwnerWon ? 1 : 1 / k;
      return sum + weight;
    }, 0);

    // First non-owner misser on a question takes a failed-steal penalty.
    const wrongBuzzes = scoredQuestions.filter(
      (question) => question.missedBy[0] === player.id && !owns(question)
    ).length;

    const defenseScore =
      ownQuestions === 0 ? 0 : ((onTopic - 0.5 * missedWeight) / ownQuestions) * 100;
    const offenseBonus =
      otherQuestions === 0 ? 0 : ((2 * outOfTopic - wrongBuzzes) / otherQuestions) * 100;
    const totalScore = 0.7 * defenseScore + 0.3 * offenseBonus + bonusPoints;

    return {
      playerId: player.id,
      name: player.name,
      correctAnswers,
      onTopic,
      outOfTopic,
      missedTopic,
      wrongBuzzes,
      ownQuestions,
      otherQuestions,
      bonusCorrect,
      bonusPoints,
      defenseScore: roundScore(defenseScore),
      offenseBonus: roundScore(offenseBonus),
      totalScore: roundScore(totalScore)
    };
  });
}
