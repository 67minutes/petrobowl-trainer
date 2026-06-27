export type SessionTopicMode = "topics" | "playerAssigned" | "playerAssignedPlus";
export type DatabaseSessionTopicMode = "topics" | "player_assigned" | "player_assigned_plus";
export type SessionTopicSource = "manual" | "assigned" | "extra" | "legacy";

export type SessionPoolTopic = {
  id: string;
};

export type SessionPoolAssignment = {
  topicId: string;
  playerId: string;
};

export type SessionPoolQuestion = {
  id: string;
  topicId: string;
};

export type EligibleSessionQuestion = SessionPoolQuestion & {
  assignedTo: string | null;
  balanceGroup: string;
};

export type SessionQuestionPool = {
  topicSources: Map<string, SessionTopicSource>;
  questions: EligibleSessionQuestion[];
};

const DATABASE_TOPIC_MODES: Record<SessionTopicMode, DatabaseSessionTopicMode> = {
  topics: "topics",
  playerAssigned: "player_assigned",
  playerAssignedPlus: "player_assigned_plus"
};

const CLIENT_TOPIC_MODES: Record<DatabaseSessionTopicMode, SessionTopicMode> = {
  topics: "topics",
  player_assigned: "playerAssigned",
  player_assigned_plus: "playerAssignedPlus"
};

export function toDatabaseTopicMode(mode: SessionTopicMode): DatabaseSessionTopicMode {
  return DATABASE_TOPIC_MODES[mode];
}

export function fromDatabaseTopicMode(mode: DatabaseSessionTopicMode): SessionTopicMode {
  return CLIENT_TOPIC_MODES[mode];
}

function unique(values: string[]) {
  return [...new Set(values)];
}

export function buildSessionQuestionPool(input: {
  topicMode: SessionTopicMode;
  participantIds: string[];
  selectedTopicIds?: string[];
  topics: SessionPoolTopic[];
  assignments: SessionPoolAssignment[];
  questions: SessionPoolQuestion[];
}): SessionQuestionPool {
  const participantIds = unique(input.participantIds);
  const participantSet = new Set(participantIds);

  if (!participantSet.size) {
    throw new Error("Select at least one participant.");
  }

  const knownTopicIds = new Set(input.topics.map((topic) => topic.id));
  const selectedTopicIds = unique(input.selectedTopicIds ?? []);
  const unknownTopic = selectedTopicIds.find((topicId) => !knownTopicIds.has(topicId));

  if (unknownTopic) {
    throw new Error("Selected topic not found.");
  }

  const ownerByTopicId = new Map<string, string>();
  for (const assignment of input.assignments) {
    if (knownTopicIds.has(assignment.topicId)) {
      ownerByTopicId.set(assignment.topicId, assignment.playerId);
    }
  }

  const topicSources = new Map<string, SessionTopicSource>();

  if (input.topicMode === "topics") {
    for (const topicId of selectedTopicIds) {
      topicSources.set(topicId, "manual");
    }
  } else {
    for (const topic of input.topics) {
      const ownerId = ownerByTopicId.get(topic.id);
      if (ownerId && participantSet.has(ownerId)) {
        topicSources.set(topic.id, "assigned");
      }
    }

    if (input.topicMode === "playerAssignedPlus") {
      for (const topicId of selectedTopicIds) {
        if (!topicSources.has(topicId)) {
          topicSources.set(topicId, "extra");
        }
      }
    }
  }

  if (!topicSources.size) {
    throw new Error("Select at least one topic.");
  }

  const questions = input.questions
    .filter((question) => topicSources.has(question.topicId))
    .map<EligibleSessionQuestion>((question) => {
      const assignedTo = ownerByTopicId.get(question.topicId) ?? null;

      return {
        ...question,
        assignedTo,
        balanceGroup: assignedTo && participantSet.has(assignedTo) ? assignedTo : "extra"
      };
    });

  if (!questions.length) {
    throw new Error("No eligible questions.");
  }

  return {
    topicSources,
    questions
  };
}
