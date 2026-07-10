import type { DrillMode, DrillTopicOption } from "@/types/drill";

export type QueueTopic = {
  id: string;
  name: string;
  displayOrder: number;
};

export type QueueQuestion = {
  id: string;
  topicId: string;
  question?: string;
  answer?: string;
  acceptedAnswers?: string[];
  imageUrl?: string | null;
  imageCaption?: string | null;
  displayOrder: number;
};

export type QueueProgress = {
  questionId: string;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReview: string;
};

export type QueueResponseStats = {
  againCount: number;
  averageResponseTimeMs: number;
  lastReviewedAt: string | null;
};

export type QueueSelectionInput = {
  mode: DrillMode;
  today: string;
  questions: QueueQuestion[];
  progressRows: QueueProgress[];
  responseStatsByQuestionId: Map<string, QueueResponseStats>;
  selectedTopicIds: string[];
  remainingNewCardsToday: number;
};

const validModes = new Set<DrillMode>(["smart", "due", "weak", "new"]);

export function parseDrillMode(value: string | null): DrillMode {
  return value && validModes.has(value as DrillMode) ? (value as DrillMode) : "smart";
}

export function resolveSelectedTopicIds(activeTopicIds: string[], requestedTopicIds: string[]) {
  const active = new Set(activeTopicIds);
  const requested = [...new Set(requestedTopicIds)].filter((topicId) => active.has(topicId));
  return requested.length ? requested : activeTopicIds;
}

export function isWeakCard(
  progress: Pick<QueueProgress, "easeFactor" | "intervalDays">,
  stats: QueueResponseStats | undefined
) {
  return progress.easeFactor < 2 || progress.intervalDays < 7 || (stats?.againCount ?? 0) > 0;
}

export function calculateWeaknessScore(
  progress: Pick<QueueProgress, "easeFactor" | "intervalDays">,
  stats: QueueResponseStats | undefined
) {
  const easePressure = Math.max(0, 2.5 - progress.easeFactor) * 18;
  const againPressure = (stats?.againCount ?? 0) * 12;
  const slowPressure = Math.max(0, (stats?.averageResponseTimeMs ?? 0) - 12_000) / 1_500;
  const lowIntervalPressure = Math.max(0, 7 - progress.intervalDays) * 2;
  return easePressure + againPressure + slowPressure + lowIntervalPressure;
}

export function buildTopicOptions(
  topics: QueueTopic[],
  questions: QueueQuestion[],
  progressRows: QueueProgress[],
  responseStatsByQuestionId: Map<string, QueueResponseStats>,
  today: string
): DrillTopicOption[] {
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const questionsByTopic = new Map<string, QueueQuestion[]>();
  const progressByQuestionId = new Map(progressRows.map((row) => [row.questionId, row]));

  for (const question of questions) {
    questionsByTopic.set(question.topicId, [...(questionsByTopic.get(question.topicId) ?? []), question]);
  }

  return topics
    .map((topic) => {
      const topicQuestions = questionsByTopic.get(topic.id) ?? [];
      let dueCount = 0;
      let masteredCount = 0;
      let weakCount = 0;

      for (const question of topicQuestions) {
        const progress = progressByQuestionId.get(question.id);
        if (!progress) {
          continue;
        }
        if (progress.nextReview <= today) {
          dueCount += 1;
        }
        if (progress.intervalDays >= 21) {
          masteredCount += 1;
        }
        if (isWeakCard(progress, responseStatsByQuestionId.get(question.id))) {
          weakCount += 1;
        }
      }

      return {
        id: topic.id,
        name: topicById.get(topic.id)?.name ?? "Topic",
        assignedQuestions: topicQuestions.length,
        dueCount,
        unseenCount: topicQuestions.filter((question) => !progressByQuestionId.has(question.id)).length,
        masteredCount,
        weakCount
      };
    })
    .sort((left, right) => {
      const leftTopic = topicById.get(left.id);
      const rightTopic = topicById.get(right.id);
      return (leftTopic?.displayOrder ?? 0) - (rightTopic?.displayOrder ?? 0) || left.name.localeCompare(right.name);
    });
}

export function selectNextQuestion(input: QueueSelectionInput) {
  const selectedTopicSet = new Set(input.selectedTopicIds);
  const selectedQuestions = input.questions
    .filter((question) => selectedTopicSet.has(question.topicId))
    .sort((left, right) => left.displayOrder - right.displayOrder);
  const progressByQuestionId = new Map(input.progressRows.map((row) => [row.questionId, row]));
  const dueQuestions = selectedQuestions
    .flatMap((question) => {
      const progress = progressByQuestionId.get(question.id);
      return progress && progress.nextReview <= input.today ? [{ question, progress }] : [];
    })
    .sort((left, right) => {
      const reviewDifference = left.progress.nextReview.localeCompare(right.progress.nextReview);
      if (reviewDifference !== 0) {
        return reviewDifference;
      }
      return left.question.displayOrder - right.question.displayOrder;
    });
  const newQuestions = selectedQuestions.filter((question) => !progressByQuestionId.has(question.id));
  const weakQuestions = selectedQuestions
    .flatMap((question) => {
      const progress = progressByQuestionId.get(question.id);
      if (!progress) {
        return [];
      }
      const stats = input.responseStatsByQuestionId.get(question.id);
      if (!isWeakCard(progress, stats)) {
        return [];
      }
      return [
        {
          question,
          score: calculateWeaknessScore(progress, stats),
          lastReviewedAt: stats?.lastReviewedAt ?? ""
        }
      ];
    })
    .sort((left, right) => {
      const scoreDifference = right.score - left.score;
      if (scoreDifference !== 0) {
        return scoreDifference;
      }
      return right.lastReviewedAt.localeCompare(left.lastReviewedAt);
    });

  if (input.mode === "due") {
    return dueQuestions[0]?.question ?? null;
  }

  if (input.mode === "weak") {
    return weakQuestions[0]?.question ?? null;
  }

  if (input.mode === "new") {
    return input.remainingNewCardsToday > 0 ? newQuestions[0] ?? null : null;
  }

  return dueQuestions[0]?.question ?? (input.remainingNewCardsToday > 0 ? newQuestions[0] ?? null : null);
}
