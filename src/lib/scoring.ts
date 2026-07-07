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
  defenseScore: number;
  offenseBonus: number;
  totalScore: number;
};

function roundScore(value: number) {
  return Math.round(value * 10) / 10;
}

export function calculateSessionScores(
  players: SessionPlayer[],
  questions: ScoredSessionQuestion[]
): PlayerScore[] {
  return players.map((player) => {
    const owns = (question: ScoredSessionQuestion) => question.owners.includes(player.id);
    const wonBy = (question: ScoredSessionQuestion) =>
      question.buzzedBy === player.id && question.correct;

    const ownQuestions = questions.filter(owns).length;
    const otherQuestions = questions.length - ownQuestions;

    const correctAnswers = questions.filter(
      (question) => question.buzzedBy === player.id && question.correct
    ).length;

    const onTopic = questions.filter((question) => owns(question) && wonBy(question)).length;
    const outOfTopic = questions.filter(
      (question) => !owns(question) && question.buzzedBy === player.id && question.correct
    ).length;

    // Non-win on an owned question (integer count, for display parity).
    const missedTopic = questions.filter((question) => owns(question) && !wonBy(question)).length;

    // Weighted defense penalty: an owner buzzing wrong on their own topic, or a
    // co-owner taking it, is a full miss (weight 1); a steal by a non-owner or a
    // no-correct-answer outcome splits the blame across co-owners (weight 1/k).
    const missedWeight = questions.reduce((sum, question) => {
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
    const wrongBuzzes = questions.filter(
      (question) => question.missedBy[0] === player.id && !owns(question)
    ).length;

    const defenseScore =
      ownQuestions === 0 ? 0 : ((onTopic - 0.5 * missedWeight) / ownQuestions) * 100;
    const offenseBonus =
      otherQuestions === 0 ? 0 : ((2 * outOfTopic - wrongBuzzes) / otherQuestions) * 100;
    const totalScore = 0.7 * defenseScore + 0.3 * offenseBonus;

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
      defenseScore: roundScore(defenseScore),
      offenseBonus: roundScore(offenseBonus),
      totalScore: roundScore(totalScore)
    };
  });
}
