import { calculateSessionScores } from "@/lib/scoring";
import type {
  OffenseDefense,
  PlayerReadiness,
  QuadrantLabel,
  SpeedProfile,
  TopicStrengthCell
} from "@/types/coach";

export type CoachDrillRow = {
  playerId: string;
  questionId: string;
  correct: boolean;
  responseTimeMs: number;
  reviewedAt: string;
};

export type CoachProgressRow = {
  playerId: string;
  questionId: string;
  intervalDays: number;
  nextReview: string;
};

export type CoachSessionQuestion = {
  id: string;
  sessionId: string;
  topicId: string | null;
  owners: string[];
  buzzedBy: string | null;
  correct: boolean;
  missedBy: string[];
};

const MASTERY_INTERVAL_DAYS = 21;
const THIN_DATA_THRESHOLD = 3;
const TREND_DELTA = 5;

function percent(part: number, total: number) {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

function dateOnly(value: string) {
  return value.slice(0, 10);
}

/**
 * A question counts for offense/defense once it has been resolved: someone
 * answered (buzzed_by set) or it was ruled out (correct === false). Open,
 * never-resolved questions are excluded so the owner is not penalised for them.
 */
export function isResolved(question: Pick<CoachSessionQuestion, "buzzedBy" | "correct">) {
  return question.buzzedBy !== null || !question.correct;
}

export function buildTopicStrengthRow(input: {
  playerId: string;
  topics: { id: string }[];
  topicByQuestionId: Map<string, string>;
  drillRows: CoachDrillRow[];
  sessionQuestions: CoachSessionQuestion[];
  ownedTopicIds: Set<string>;
}): TopicStrengthCell[] {
  const studyCorrect = new Map<string, number>();
  const studyTotal = new Map<string, number>();

  for (const drill of input.drillRows) {
    if (drill.playerId !== input.playerId) {
      continue;
    }
    const topicId = input.topicByQuestionId.get(drill.questionId);
    if (!topicId) {
      continue;
    }
    studyTotal.set(topicId, (studyTotal.get(topicId) ?? 0) + 1);
    if (drill.correct) {
      studyCorrect.set(topicId, (studyCorrect.get(topicId) ?? 0) + 1);
    }
  }

  const buzzCorrect = new Map<string, number>();
  const buzzTotal = new Map<string, number>();

  for (const question of input.sessionQuestions) {
    if (!question.topicId) {
      continue;
    }
    const answeredCorrectly = question.buzzedBy === input.playerId && question.correct;
    const missed = question.missedBy.includes(input.playerId);
    if (!answeredCorrectly && !missed) {
      continue;
    }
    buzzTotal.set(question.topicId, (buzzTotal.get(question.topicId) ?? 0) + 1);
    if (answeredCorrectly) {
      buzzCorrect.set(question.topicId, (buzzCorrect.get(question.topicId) ?? 0) + 1);
    }
  }

  return input.topics.map((topic) => {
    const nStudy = studyTotal.get(topic.id) ?? 0;
    const nBuzz = buzzTotal.get(topic.id) ?? 0;
    const studyAccuracy = nStudy === 0 ? 0 : (studyCorrect.get(topic.id) ?? 0) / nStudy * 100;
    const buzzAccuracy = nBuzz === 0 ? 0 : (buzzCorrect.get(topic.id) ?? 0) / nBuzz * 100;
    const totalSamples = nStudy + nBuzz;
    const blended =
      totalSamples === 0 ? 0 : (studyAccuracy * nStudy + buzzAccuracy * nBuzz) / totalSamples;

    return {
      topicId: topic.id,
      blended: Math.round(blended),
      studyAccuracy: Math.round(studyAccuracy),
      studySamples: nStudy,
      buzzAccuracy: Math.round(buzzAccuracy),
      buzzSamples: nBuzz,
      owned: input.ownedTopicIds.has(topic.id),
      thinData: totalSamples < THIN_DATA_THRESHOLD
    };
  });
}

export function buildPlayerReadiness(input: {
  playerId: string;
  assignedQuestionIds: Set<string>;
  progressRows: CoachProgressRow[];
  drillRows: CoachDrillRow[];
  today: string;
}): PlayerReadiness {
  const assignedQuestions = input.assignedQuestionIds.size;
  const playerProgress = input.progressRows.filter(
    (row) => row.playerId === input.playerId && input.assignedQuestionIds.has(row.questionId)
  );
  const mastered = playerProgress.filter((row) => row.intervalDays >= MASTERY_INTERVAL_DAYS).length;
  const dueBacklog = playerProgress.filter((row) => row.nextReview <= input.today).length;

  const todayDate = new Date(`${input.today}T00:00:00.000Z`);
  const last7Start = new Date(todayDate);
  last7Start.setUTCDate(last7Start.getUTCDate() - 6);
  const prev7Start = new Date(todayDate);
  prev7Start.setUTCDate(prev7Start.getUTCDate() - 13);
  const last7StartDate = dateOnly(last7Start.toISOString());
  const prev7StartDate = dateOnly(prev7Start.toISOString());

  const playerDrills = input.drillRows.filter((row) => row.playerId === input.playerId);
  const activeDays = new Set<string>();
  let last7Total = 0;
  let last7Correct = 0;
  let prev7Total = 0;
  let prev7Correct = 0;

  for (const drill of playerDrills) {
    const day = dateOnly(drill.reviewedAt);
    if (day >= last7StartDate && day <= input.today) {
      activeDays.add(day);
      last7Total += 1;
      if (drill.correct) {
        last7Correct += 1;
      }
    } else if (day >= prev7StartDate && day < last7StartDate) {
      prev7Total += 1;
      if (drill.correct) {
        prev7Correct += 1;
      }
    }
  }

  const accuracyLast7 = percent(last7Correct, last7Total);
  const accuracyPrev7 = percent(prev7Correct, prev7Total);
  let accuracyTrend: PlayerReadiness["accuracyTrend"] = "flat";
  if (prev7Total > 0 && last7Total > 0) {
    if (accuracyLast7 - accuracyPrev7 >= TREND_DELTA) {
      accuracyTrend = "up";
    } else if (accuracyPrev7 - accuracyLast7 >= TREND_DELTA) {
      accuracyTrend = "down";
    }
  }

  return {
    assignedQuestions,
    mastered,
    masteryPct: percent(mastered, assignedQuestions),
    dueBacklog,
    consistencyDays: activeDays.size,
    accuracyLast7,
    accuracyTrend
  };
}

export function buildSpeedProfile(playerId: string, drillRows: CoachDrillRow[]): SpeedProfile {
  const times = drillRows
    .filter((row) => row.playerId === playerId && row.responseTimeMs > 0)
    .map((row) => row.responseTimeMs)
    .sort((left, right) => left - right);

  if (!times.length) {
    return { samples: 0, minMs: 0, medianMs: 0, maxMs: 0 };
  }

  const middle = Math.floor(times.length / 2);
  const medianMs =
    times.length % 2 === 0 ? Math.round((times[middle - 1] + times[middle]) / 2) : times[middle];

  return {
    samples: times.length,
    minMs: times[0],
    medianMs,
    maxMs: times[times.length - 1]
  };
}

export function quadrantLabel(defenseScore: number, offenseBonus: number): QuadrantLabel {
  if (offenseBonus < 0 || defenseScore < 40) {
    return "liability";
  }
  if (defenseScore >= 60 && offenseBonus >= 0) {
    return "anchor";
  }
  if (offenseBonus > 0) {
    return "stealer";
  }
  return "balanced";
}

export function aggregateOffenseDefense(
  player: { id: string; name: string },
  sessionQuestions: CoachSessionQuestion[]
): OffenseDefense {
  const resolved = sessionQuestions.filter(isResolved);
  const [score] = calculateSessionScores(
    [player],
    resolved.map((question) => ({
      id: question.id,
      owners: question.owners,
      buzzedBy: question.buzzedBy,
      correct: question.correct,
      missedBy: question.missedBy
    }))
  );

  return {
    onTopic: score.onTopic,
    outOfTopic: score.outOfTopic,
    missedTopic: score.missedTopic,
    wrongBuzzes: score.wrongBuzzes,
    ownQuestions: score.ownQuestions,
    otherQuestions: score.otherQuestions,
    defenseScore: score.defenseScore,
    offenseBonus: score.offenseBonus,
    totalScore: score.totalScore,
    label: quadrantLabel(score.defenseScore, score.offenseBonus)
  };
}
