export type DrillMode = "smart" | "due" | "weak" | "new";

export type DrillQueueCard = {
  questionId: string;
  topicId: string;
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
  unseenQuestions: number;
  mastered: number;
  weakCards: number;
};

export type DrillTopicOption = {
  id: string;
  name: string;
  assignedQuestions: number;
  dueCount: number;
  unseenCount: number;
  masteredCount: number;
  weakCount: number;
};

export type DrillQueueData = {
  card: DrillQueueCard | null;
  stats: DrillQueueStats;
  mode: DrillMode;
  selectedTopicIds: string[];
  topicOptions: DrillTopicOption[];
};

export type DrillReviewResult = {
  nextReview: string;
  intervalDays: number;
  easeFactor: number;
};
