import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateSessionScores } from "@/lib/scoring";
import type { PlayerRole, SessionStatus } from "@/types/database";
import type { QuizSessionData, QuizSessionQuestion } from "@/types/session";

type AuthenticatedPlayer = {
  id: string;
  team_id: string;
  name: string;
  role: PlayerRole;
};

type RawSession = {
  id: string;
  name: string;
  status: SessionStatus;
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
  questions: { question: string; answer: string } | { question: string; answer: string }[] | null;
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

export async function loadSessionData(supabase: SupabaseClient, teamId: string): Promise<QuizSessionData> {
  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, name, role")
    .eq("team_id", teamId)
    .eq("is_player", true)
    .order("name");

  if (playersError || !players) {
    throw new Error(playersError?.message ?? "Could not load players.");
  }

  const sessionPlayers = players.map((player) => ({
    id: String(player.id),
    name: String(player.name),
    role: player.role as PlayerRole
  }));

  const { data: sessionRows, error: sessionError } = await supabase
    .from("sessions")
    .select("id, name, status, num_questions, created_at, completed_at")
    .eq("team_id", teamId)
    .in("status", ["draft", "active"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  const rawSession = (sessionRows?.[0] ?? null) as RawSession | null;

  if (!rawSession) {
    return {
      players: sessionPlayers,
      scores: calculateSessionScores(sessionPlayers, []),
      session: null
    };
  }

  const { data: questionRows, error: questionsError } = await supabase
    .from("session_questions")
    .select("id, question_id, question_order, assigned_to, buzzed_by, correct, questions(question, answer)")
    .eq("session_id", rawSession.id)
    .order("question_order");

  if (questionsError || !questionRows) {
    throw new Error(questionsError?.message ?? "Could not load session questions.");
  }

  const playerNameById = new Map(sessionPlayers.map((player) => [player.id, player.name]));
  const questions: QuizSessionQuestion[] = (questionRows as RawSessionQuestion[]).map((row) => {
    const question = readRelation(row.questions);

    return {
      id: row.id,
      questionId: row.question_id,
      order: row.question_order,
      question: question?.question ?? "",
      answer: question?.answer ?? "",
      assignedTo: row.assigned_to,
      assignedToName: row.assigned_to ? playerNameById.get(row.assigned_to) ?? null : null,
      buzzedBy: row.buzzed_by,
      buzzedByName: row.buzzed_by ? playerNameById.get(row.buzzed_by) ?? null : null,
      correct: row.correct
    };
  });

  const answeredQuestions = questions.filter((question) => question.buzzedBy !== null || !question.correct);

  return {
    players: sessionPlayers,
    scores: calculateSessionScores(
      sessionPlayers,
      answeredQuestions.map((question) => ({
        id: question.id,
        assignedTo: question.assignedTo,
        buzzedBy: question.buzzedBy,
        correct: question.correct
      }))
    ),
    session: {
      id: rawSession.id,
      name: rawSession.name,
      status: rawSession.status,
      numQuestions: rawSession.num_questions,
      createdAt: rawSession.created_at,
      completedAt: rawSession.completed_at,
      questions
    }
  };
}
