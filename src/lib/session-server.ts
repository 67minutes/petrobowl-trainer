import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateSessionScores } from "@/lib/scoring";
import { fromDatabaseTopicMode, type DatabaseSessionTopicMode } from "@/lib/session-pool";
import type { PlayerRole, SessionStatus } from "@/types/database";
import type {
  QuizSessionData,
  QuizSessionQuestion,
  SessionSetupData,
  SessionSummary
} from "@/types/session";

type AuthenticatedPlayer = {
  id: string;
  team_id: string;
  name: string;
  role: PlayerRole;
};

type RawTeamPlayer = {
  id: string;
  name: string;
  role: PlayerRole;
  is_player: boolean;
};

type RawSession = {
  id: string;
  name: string;
  status: SessionStatus;
  topic_mode: DatabaseSessionTopicMode;
  num_questions: number;
  created_at: string;
  completed_at: string | null;
};

type RawSessionQuestion = {
  id: string;
  question_id: string;
  question_order: number;
  assigned_to: string | null;
  buzzed_by: string | null;
  correct: boolean;
  missed_by: string[] | null;
  questions:
    | {
        question: string;
        answer: string;
        topic_id: string;
        topics: { name: string } | { name: string }[] | null;
      }
    | {
        question: string;
        answer: string;
        topic_id: string;
        topics: { name: string } | { name: string }[] | null;
      }[]
    | null;
};

type RawTopic = {
  id: string;
  name: string;
  display_order: number;
};

type RawAssignment = {
  topic_id: string;
  player_id: string;
};

type RawQuestion = {
  id: string;
  topic_id: string;
};

type RawSessionParticipant = {
  session_id: string;
  player_id: string;
};

type RawSessionTopic = {
  session_id: string;
  topic_id: string;
};

type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

export function readRelation<T>(relation: T | T[] | null) {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

export async function fetchAllPages<T>(
  loadPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  label: string
) {
  const pageSize = 1000;
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await loadPage(from, from + pageSize - 1);

    if (error || !data) {
      throw new Error(`${label}: ${error?.message ?? "missing rows"}`);
    }

    rows.push(...data);

    if (data.length < pageSize) {
      return rows;
    }
  }
}

export async function getAuthenticatedPlayer(supabase: SupabaseClient, token: string) {
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    throw new Error("Invalid session.");
  }

  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("id, team_id, name, role")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (playerError) {
    throw new Error(playerError.message);
  }

  if (!player) {
    throw new Error("No player linked.");
  }

  return player as AuthenticatedPlayer;
}

export function isSessionQuestionAnswered(question: { buzzedBy: string | null; correct: boolean }) {
  return question.buzzedBy !== null || !question.correct;
}

export function pickRequestedSession<T extends { id: string }>(sessions: T[], sessionId: string) {
  return sessions.find((session) => session.id === sessionId) ?? null;
}

async function loadTeamPlayers(supabase: SupabaseClient, teamId: string) {
  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, name, role, is_player")
    .eq("team_id", teamId)
    .order("name");

  if (playersError || !players) {
    throw new Error(playersError?.message ?? "Could not load players.");
  }

  return players as RawTeamPlayer[];
}

export async function loadSessionData(
  supabase: SupabaseClient,
  teamId: string,
  sessionId: string
): Promise<QuizSessionData> {
  const teamPlayers = await loadTeamPlayers(supabase, teamId);
  const playerNameById = new Map(teamPlayers.map((player) => [player.id, player.name]));

  const { data: sessionRows, error: sessionError } = await supabase
    .from("sessions")
    .select("id, name, status, topic_mode, num_questions, created_at, completed_at")
    .eq("team_id", teamId)
    .eq("id", sessionId);

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  const rawSession = pickRequestedSession((sessionRows ?? []) as RawSession[], sessionId);

  if (!rawSession) {
    throw new Error("Session not found.");
  }

  const { data: participantRows, error: participantError } = await supabase
    .from("session_participants")
    .select("session_id, player_id")
    .eq("session_id", rawSession.id);

  if (participantError || !participantRows) {
    throw new Error(participantError?.message ?? "Could not load session participants.");
  }

  const participantIds = new Set((participantRows as RawSessionParticipant[]).map((row) => row.player_id));
  const sessionPlayers = teamPlayers
    .filter((player) => participantIds.has(player.id))
    .map((player) => ({
      id: player.id,
      name: player.name,
      role: player.role
    }));

  const { data: questionRows, error: questionsError } = await supabase
    .from("session_questions")
    .select("id, question_id, question_order, assigned_to, buzzed_by, correct, missed_by, questions(question, answer, topic_id, topics(name))")
    .eq("session_id", rawSession.id)
    .order("question_order");

  if (questionsError || !questionRows) {
    throw new Error(questionsError?.message ?? "Could not load session questions.");
  }

  const questions: QuizSessionQuestion[] = (questionRows as RawSessionQuestion[]).map((row) => {
    const question = readRelation(row.questions);
    const topic = question ? readRelation(question.topics) : null;
    const missedBy = row.missed_by ?? [];

    return {
      id: row.id,
      questionId: row.question_id,
      order: row.question_order,
      topicId: question?.topic_id ?? null,
      topicName: topic?.name ?? null,
      question: question?.question ?? "",
      answer: question?.answer ?? "",
      assignedTo: row.assigned_to,
      assignedToName: row.assigned_to ? playerNameById.get(row.assigned_to) ?? null : null,
      buzzedBy: row.buzzed_by,
      buzzedByName: row.buzzed_by ? playerNameById.get(row.buzzed_by) ?? null : null,
      correct: row.correct,
      missedBy,
      missedByNames: missedBy.map((id) => playerNameById.get(id) ?? "Unknown")
    };
  });

  const answeredQuestions = questions.filter(isSessionQuestionAnswered);

  return {
    players: sessionPlayers,
    scores: calculateSessionScores(
      sessionPlayers,
      answeredQuestions.map((question) => ({
        id: question.id,
        assignedTo: question.assignedTo,
        buzzedBy: question.buzzedBy,
        correct: question.correct,
        missedBy: question.missedBy
      }))
    ),
    session: {
      id: rawSession.id,
      name: rawSession.name,
      status: rawSession.status,
      topicMode: fromDatabaseTopicMode(rawSession.topic_mode),
      numQuestions: rawSession.num_questions,
      createdAt: rawSession.created_at,
      completedAt: rawSession.completed_at,
      questions
    }
  };
}

export async function loadSessionSetupData(
  supabase: SupabaseClient,
  teamId: string
): Promise<SessionSetupData> {
  const teamPlayers = await loadTeamPlayers(supabase, teamId);
  const activePlayers = teamPlayers
    .filter((player) => player.is_player)
    .map((player) => ({ id: player.id, name: player.name, role: player.role }));
  const playerNameById = new Map(teamPlayers.map((player) => [player.id, player.name]));

  const [
    { data: topics, error: topicsError },
    { data: assignments, error: assignmentsError },
    questionRows,
    { data: sessions, error: sessionsError }
  ] = await Promise.all([
    supabase
      .from("topics")
      .select("id, name, display_order")
      .eq("team_id", teamId)
      .order("display_order"),
    supabase.from("topic_assignments").select("topic_id, player_id").is("unassigned_at", null),
    fetchAllPages<RawQuestion>(
      (from, to) => supabase.from("questions").select("id, topic_id").range(from, to),
      "Could not load questions"
    ),
    supabase
      .from("sessions")
      .select("id, name, status, topic_mode, num_questions, created_at, completed_at")
      .eq("team_id", teamId)
      .in("status", ["draft", "active"])
      .order("created_at", { ascending: false })
  ]);

  if (topicsError || !topics) {
    throw new Error(topicsError?.message ?? "Could not load topics.");
  }

  if (assignmentsError || !assignments) {
    throw new Error(assignmentsError?.message ?? "Could not load assignments.");
  }

  if (sessionsError || !sessions) {
    throw new Error(sessionsError?.message ?? "Could not load sessions.");
  }

  const topicRows = topics as RawTopic[];
  const teamTopicIds = new Set(topicRows.map((topic) => topic.id));
  const assignmentRows = (assignments as RawAssignment[]).filter((assignment) =>
    teamTopicIds.has(assignment.topic_id)
  );
  const ownerByTopicId = new Map(assignmentRows.map((assignment) => [assignment.topic_id, assignment.player_id]));
  const questionCountByTopicId = new Map<string, number>();

  for (const question of questionRows) {
    if (teamTopicIds.has(question.topic_id)) {
      questionCountByTopicId.set(question.topic_id, (questionCountByTopicId.get(question.topic_id) ?? 0) + 1);
    }
  }

  const sessionRows = sessions as RawSession[];
  const sessionIds = sessionRows.map((session) => session.id);
  let participantRows: RawSessionParticipant[] = [];
  let sessionTopicRows: RawSessionTopic[] = [];

  if (sessionIds.length) {
    const [{ data: participants, error: participantError }, { data: sessionTopics, error: sessionTopicsError }] =
      await Promise.all([
        supabase
          .from("session_participants")
          .select("session_id, player_id")
          .in("session_id", sessionIds),
        supabase.from("session_topics").select("session_id, topic_id").in("session_id", sessionIds)
      ]);

    if (participantError || !participants) {
      throw new Error(participantError?.message ?? "Could not load session participants.");
    }

    if (sessionTopicsError || !sessionTopics) {
      throw new Error(sessionTopicsError?.message ?? "Could not load session topics.");
    }

    participantRows = participants as RawSessionParticipant[];
    sessionTopicRows = sessionTopics as RawSessionTopic[];
  }

  const participantIdsBySessionId = new Map<string, string[]>();
  for (const row of participantRows) {
    participantIdsBySessionId.set(row.session_id, [
      ...(participantIdsBySessionId.get(row.session_id) ?? []),
      row.player_id
    ]);
  }

  const topicIdsBySessionId = new Map<string, Set<string>>();
  for (const row of sessionTopicRows) {
    const topicIds = topicIdsBySessionId.get(row.session_id) ?? new Set<string>();
    topicIds.add(row.topic_id);
    topicIdsBySessionId.set(row.session_id, topicIds);
  }

  const sessionSummaries: SessionSummary[] = sessionRows.map((session) => {
    const participantIds = participantIdsBySessionId.get(session.id) ?? [];

    return {
      id: session.id,
      name: session.name,
      status: session.status,
      topicMode: fromDatabaseTopicMode(session.topic_mode),
      numQuestions: session.num_questions,
      createdAt: session.created_at,
      completedAt: session.completed_at,
      participantIds,
      participantNames: participantIds.map((id) => playerNameById.get(id) ?? "Unknown"),
      topicCount: topicIdsBySessionId.get(session.id)?.size ?? 0
    };
  });

  return {
    players: activePlayers,
    topics: topicRows.map((topic) => {
      const ownerId = ownerByTopicId.get(topic.id) ?? null;

      return {
        id: topic.id,
        name: topic.name,
        displayOrder: topic.display_order,
        ownerId,
        ownerName: ownerId ? playerNameById.get(ownerId) ?? null : null,
        questionCount: questionCountByTopicId.get(topic.id) ?? 0
      };
    }),
    sessions: sessionSummaries
  };
}
