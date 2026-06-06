export type DrillQueueCard = {
  questionId: string;
  question: string;
  answer: string;
  topic: string;
  isNew: boolean;
  progress: {
    easeFactor: number;
    intervalDays: number;
    repetitions: number;
  };
};

export type DrillQueueStats = {
  assignedQuestions: number;
  dueReviews: number;
  newCards: number;
  mastered: number;
};

export type DrillQueueData = {
  card: DrillQueueCard | null;
  stats: DrillQueueStats;
};

export type DrillReviewResult = {
  nextReview: string;
  intervalDays: number;
  easeFactor: number;
};
