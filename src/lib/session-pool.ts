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
  termKey: string;
};

export type EligibleSessionQuestion = {
  id: string;
  topicId: string;
  termKey: string;
  assignedTo: string | null;
  owners: string[];
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

  const ownersByTopicId = new Map<string, string[]>();
  for (const assignment of input.assignments) {
    if (knownTopicIds.has(assignment.topicId)) {
      const current = ownersByTopicId.get(assignment.topicId) ?? [];
      if (!current.includes(assignment.playerId)) {
        current.push(assignment.playerId);
      }
      ownersByTopicId.set(assignment.topicId, current);
    }
  }

  const topicSources = new Map<string, SessionTopicSource>();

  if (input.topicMode === "topics") {
    for (const topicId of selectedTopicIds) {
      topicSources.set(topicId, "manual");
    }
  } else {
    for (const topic of input.topics) {
      const owners = ownersByTopicId.get(topic.id) ?? [];
      if (owners.some((ownerId) => participantSet.has(ownerId))) {
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

  const eligible = input.questions.filter((question) => topicSources.has(question.topicId));

  // Collapse multi-home duplicates: one question per unique term_key, whose owner
  // set is the union of owners across the term's topics, intersected with participants.
  const groups = new Map<string, { representative: SessionPoolQuestion; owners: Set<string> }>();
  for (const question of eligible) {
    const group = groups.get(question.termKey) ?? { representative: question, owners: new Set<string>() };
    for (const ownerId of ownersByTopicId.get(question.topicId) ?? []) {
      if (participantSet.has(ownerId)) {
        group.owners.add(ownerId);
      }
    }
    groups.set(question.termKey, group);
  }

  const questions = [...groups.values()].map<EligibleSessionQuestion>((group) => {
    const owners = [...group.owners];
    const primaryOwner = owners[0] ?? null;

    return {
      id: group.representative.id,
      topicId: group.representative.topicId,
      termKey: group.representative.termKey,
      assignedTo: primaryOwner,
      owners,
      balanceGroup: primaryOwner ?? "extra"
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
