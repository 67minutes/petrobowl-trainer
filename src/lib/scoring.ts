export type SessionPlayer = {
  id: string;
  name: string;
};

export type ScoredSessionQuestion = {
  id: string;
  assignedTo: string | null;
  buzzedBy: string | null;
  correct: boolean;
};

export type PlayerScore = {
  playerId: string;
  name: string;
  correctAnswers: number;
  onTopic: number;
  outOfTopic: number;
  missedTopic: number;
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
    const ownQuestions = questions.filter((question) => question.assignedTo === player.id).length;
    const otherQuestions = questions.filter((question) => question.assignedTo !== player.id).length;

    const correctAnswers = questions.filter(
      (question) => question.buzzedBy === player.id && question.correct
    ).length;

    const onTopic = questions.filter(
      (question) =>
        question.assignedTo === player.id && question.buzzedBy === player.id && question.correct
    ).length;

    const outOfTopic = questions.filter(
      (question) =>
        question.assignedTo !== player.id && question.buzzedBy === player.id && question.correct
    ).length;

    const missedTopic = questions.filter((question) => {
      if (question.assignedTo !== player.id) {
        return false;
      }
      return question.buzzedBy !== player.id || !question.correct;
    }).length;

    const defenseScore =
      ownQuestions === 0 ? 0 : ((onTopic - 0.5 * missedTopic) / ownQuestions) * 100;
    const offenseBonus = otherQuestions === 0 ? 0 : ((2 * outOfTopic) / otherQuestions) * 100;
    const totalScore = 0.7 * defenseScore + 0.3 * offenseBonus;

    return {
      playerId: player.id,
      name: player.name,
      correctAnswers,
      onTopic,
      outOfTopic,
      missedTopic,
      ownQuestions,
      otherQuestions,
      defenseScore: roundScore(defenseScore),
      offenseBonus: roundScore(offenseBonus),
      totalScore: roundScore(totalScore)
    };
  });
}
