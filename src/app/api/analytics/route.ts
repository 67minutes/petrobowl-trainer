import { NextResponse } from "next/server";
import {
  buildDrillFrequencyDays,
  buildPersonalSuggestions,
  buildWeeklyDrillBuckets,
  rankWeakTopics,
  selectLatestCompletedSession,
  type AnalyticsResponseRow
} from "@/lib/analytics";
import { calculateSessionScores } from "@/lib/scoring";
import { fetchAllPages, getAuthenticatedPlayer } from "@/lib/session-server";
import { createServiceSupabaseClient } from "@/lib/supabase";
import type { AnalyticsData, LatestSessionAnalytics } from "@/types/analytics";

export const runtime = "nodejs";

type PlayerRow = {
  id: string;
  name: string;
  role: string;
};

type TopicRow = {
  id: string;
  name: string;
  display_order: number;
};

type AssignmentRow = {
  topic_id: string;
  player_id: string;
};

type QuestionRow = {
  id: string;
  topic_id: string;
  answer: string;
};

type ProgressRow = {
  player_id: string;
  question_id: string;
  ease_factor: number;
  interval_days: number;
  next_review: string;
};

type DrillResponseRow = {
  question_id: string;
  rating: string;
  response_time_ms: number;
  reviewed_at: string;
};

type SessionRow = {
  id: string;
  name: string;
  num_questions: number;
  created_at: string;
  completed_at: string | null;
};

type SessionQuestionRow = {
  id: string;
  question_id: string;
  assigned_to: string | null;
  owners: string[] | null;
  buzzed_by: string | null;
  correct: boolean;
  missed_by: string[] | null;
};

// Effective owner set: prefer the owners array; fall back to assigned_to for
// pre-overhaul session rows.
function effectiveOwners(row: { owners: string[] | null; assigned_to: string | null }): string[] {
  if (row.owners && row.owners.length > 0) {
    return row.owners;
  }
  return row.assigned_to ? [row.assigned_to] : [];
}

type SessionParticipantRow = {
  player_id: string;
};

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function percent(part: number, total: number) {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function formatSeconds(milliseconds: number) {
  if (!milliseconds) {
    return "0s";
  }
  return `${Math.round(milliseconds / 1000)}s`;
}

function isAnswered(question: Pick<SessionQuestionRow, "buzzed_by" | "correct">) {
  return question.buzzed_by !== null || !question.correct;
}

async function loadLatestSession(input: {
  supabase: ReturnType<typeof createServiceSupabaseClient>;
  sessions: SessionRow[];
  players: PlayerRow[];
  activePlayerId: string;
  questionById: Map<string, QuestionRow>;
  topicNameById: Map<string, string>;
}) {
  const latest = selectLatestCompletedSession(
    input.sessions.map((session) => ({
      id: session.id,
      name: session.name,
      createdAt: session.created_at,
      completedAt: session.completed_at
    }))
  );

  if (!latest) {
    return null;
  }

  const rawLatest = input.sessions.find((session) => session.id === latest.id);
  if (!rawLatest) {
    return null;
  }

  const [{ data: participants, error: participantsError }, sessionQuestions] = await Promise.all([
    input.supabase
      .from("session_participants")
      .select("player_id")
      .eq("session_id", rawLatest.id),
    fetchAllPages<SessionQuestionRow>(
      (from, to) =>
        input.supabase
          .from("session_questions")
          .select("id, question_id, assigned_to, owners, buzzed_by, correct, missed_by")
          .eq("session_id", rawLatest.id)
          .range(from, to),
      "Could not load latest session questions"
    )
  ]);

  if (participantsError || !participants) {
    throw new Error(participantsError?.message ?? "Could not load latest session participants.");
  }

  const participantIds = new Set((participants as SessionParticipantRow[]).map((participant) => participant.player_id));
  const sessionPlayers = input.players.filter((player) => participantIds.has(player.id));
  const activePlayerParticipated = participantIds.has(input.activePlayerId);
  const answeredQuestions = sessionQuestions.filter(isAnswered);
  const scores = calculateSessionScores(
    sessionPlayers.map((player) => ({ id: player.id, name: player.name })),
    answeredQuestions.map((question) => ({
      id: question.id,
      owners: effectiveOwners(question),
      buzzedBy: question.buzzed_by,
      correct: question.correct,
      missedBy: question.missed_by ?? []
    }))
  );
  const topicMisses = new Map<string, { topic: string; misses: number; noBuzzes: number }>();
  const followUps: LatestSessionAnalytics["followUps"] = [];

  for (const question of answeredQuestions) {
    const bankQuestion = input.questionById.get(question.question_id);
    const topic = bankQuestion ? input.topicNameById.get(bankQuestion.topic_id) ?? "Topic" : "Topic";

    if (!question.correct) {
      const current = topicMisses.get(topic) ?? { topic, misses: 0, noBuzzes: 0 };
      current.misses += 1;
      current.noBuzzes += question.buzzed_by === null ? 1 : 0;
      topicMisses.set(topic, current);
    }

    if (
      activePlayerParticipated &&
      effectiveOwners(question).includes(input.activePlayerId) &&
      (question.buzzed_by !== input.activePlayerId || !question.correct)
    ) {
      followUps.push({
        questionId: question.question_id,
        topic,
        term: bankQuestion?.answer ?? "Term",
        reason: question.buzzed_by === null ? "own-no-buzz" : "own-miss"
      });
    } else if (activePlayerParticipated && question.buzzed_by === input.activePlayerId && !question.correct) {
      followUps.push({
        questionId: question.question_id,
        topic,
        term: bankQuestion?.answer ?? "Term",
        reason: "incorrect-buzz"
      });
    }
  }

  return {
    id: rawLatest.id,
    name: rawLatest.name,
    completedAt: rawLatest.completed_at,
    questionCount: rawLatest.num_questions,
    answeredCount: answeredQuestions.length,
    playerScore: scores.find((score) => score.playerId === input.activePlayerId) ?? null,
    scores,
    topicBreakdown: [...topicMisses.values()].sort((left, right) => right.misses - left.misses).slice(0, 6),
    followUps: followUps.slice(0, 8)
  } satisfies LatestSessionAnalytics;
}

export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^bearer\s+/i, "").trim();

  if (!token) {
    return NextResponse.json({ error: "Missing session." }, { status: 401 });
  }

  try {
    const supabase = createServiceSupabaseClient();
    const activePlayer = await getAuthenticatedPlayer(supabase, token);
    const today = todayDateOnly();

    const [
      { data: players, error: playersError },
      { data: topics, error: topicsError },
      { data: assignments, error: assignmentsError },
      questionRows,
      progressRows,
      responseRows,
      { data: sessions, error: sessionsError }
    ] = await Promise.all([
      supabase
        .from("players")
        .select("id, name, role")
        .eq("team_id", activePlayer.team_id)
        .eq("is_player", true)
        .order("name"),
      supabase
        .from("topics")
        .select("id, name, display_order")
        .eq("team_id", activePlayer.team_id)
        .order("display_order"),
      supabase
        .from("topic_assignments")
        .select("topic_id, player_id")
        .is("unassigned_at", null),
      fetchAllPages<QuestionRow>(
        (from, to) =>
          supabase
            .from("questions")
            .select("id, topic_id, answer")
            .range(from, to),
        "Could not load questions"
      ),
      fetchAllPages<ProgressRow>(
        (from, to) =>
          supabase
            .from("card_progress")
            .select("player_id, question_id, ease_factor, interval_days, next_review")
            .range(from, to),
        "Could not load progress"
      ),
      fetchAllPages<DrillResponseRow>(
        (from, to) =>
          supabase
            .from("drill_responses")
            .select("question_id, rating, response_time_ms, reviewed_at")
            .eq("player_id", activePlayer.id)
            .range(from, to),
        "Could not load drill responses"
      ),
      supabase
        .from("sessions")
        .select("id, name, num_questions, created_at, completed_at")
        .eq("team_id", activePlayer.team_id)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(20)
    ]);

    if (playersError || !players) {
      return NextResponse.json({ error: playersError?.message ?? "Could not load players." }, { status: 500 });
    }

    if (topicsError || !topics) {
      return NextResponse.json({ error: topicsError?.message ?? "Could not load topics." }, { status: 500 });
    }

    if (assignmentsError || !assignments) {
      return NextResponse.json({ error: assignmentsError?.message ?? "Could not load assignments." }, { status: 500 });
    }

    if (sessionsError || !sessions) {
      return NextResponse.json({ error: sessionsError?.message ?? "Could not load sessions." }, { status: 500 });
    }

    const playerRows = players as PlayerRow[];
    const topicRows = topics as TopicRow[];
    const assignmentRows = assignments as AssignmentRow[];
    const teamTopicIds = new Set(topicRows.map((topic) => topic.id));
    const teamQuestionRows = questionRows.filter((question) => teamTopicIds.has(question.topic_id));
    const topicNameById = new Map(topicRows.map((topic) => [topic.id, topic.name]));
    const questionById = new Map(teamQuestionRows.map((question) => [question.id, question]));
    const questionIdsByTopic = new Map<string, string[]>();
    const assignedTopicIdsByPlayer = new Map<string, string[]>();
    const assignedQuestionIdsByPlayer = new Map<string, Set<string>>();

    for (const question of teamQuestionRows) {
      questionIdsByTopic.set(question.topic_id, [...(questionIdsByTopic.get(question.topic_id) ?? []), question.id]);
    }

    for (const assignment of assignmentRows) {
      assignedTopicIdsByPlayer.set(assignment.player_id, [
        ...(assignedTopicIdsByPlayer.get(assignment.player_id) ?? []),
        assignment.topic_id
      ]);
    }

    for (const player of playerRows) {
      const questionIds = new Set<string>();
      for (const topicId of assignedTopicIdsByPlayer.get(player.id) ?? []) {
        for (const questionId of questionIdsByTopic.get(topicId) ?? []) {
          questionIds.add(questionId);
        }
      }
      assignedQuestionIdsByPlayer.set(player.id, questionIds);
    }

    const activeQuestionIds = assignedQuestionIdsByPlayer.get(activePlayer.id) ?? new Set<string>();
    const activeQuestions = teamQuestionRows
      .filter((question) => activeQuestionIds.has(question.id))
      .map((question) => ({
        id: question.id,
        topicId: question.topic_id,
        topic: topicNameById.get(question.topic_id) ?? "Topic"
      }));
    const activeProgressRows = progressRows.filter(
      (row) => row.player_id === activePlayer.id && activeQuestionIds.has(row.question_id)
    );
    const analyticsResponses: AnalyticsResponseRow[] = responseRows
      .filter((row) => activeQuestionIds.has(row.question_id))
      .map((row) => ({
        questionId: row.question_id,
        rating: row.rating as AnalyticsResponseRow["rating"],
        responseTimeMs: row.response_time_ms,
        reviewedAt: row.reviewed_at
      }));
    const drillFrequency = buildDrillFrequencyDays(analyticsResponses, new Date(), 35);
    const weeklyDrill = buildWeeklyDrillBuckets(drillFrequency);
    const last7Days = drillFrequency.slice(-7);
    const reviewedLast7 = last7Days.reduce((sum, day) => sum + day.reviews, 0);
    const correctLast7 = last7Days.reduce((sum, day) => sum + day.correct, 0);
    const accuracyLast7 = percent(correctLast7, reviewedLast7);
    const consistencyDays = last7Days.filter((day) => day.reviews > 0).length;
    const latest7Date = new Date();
    latest7Date.setDate(latest7Date.getDate() - 6);
    const last7Start = latest7Date.toISOString().slice(0, 10);
    const averageResponseTimeMs = average(
      analyticsResponses
        .filter((response) => response.reviewedAt.slice(0, 10) >= last7Start)
        .map((response) => response.responseTimeMs)
    );
    const weakTopics = rankWeakTopics({
      today,
      questions: activeQuestions,
      progressRows: activeProgressRows.map((row) => ({
        questionId: row.question_id,
        easeFactor: row.ease_factor,
        intervalDays: row.interval_days,
        nextReview: row.next_review
      })),
      responses: analyticsResponses
    }).slice(0, 8);
    const assignedQuestions = activeQuestionIds.size;
    const mastered = activeProgressRows.filter((row) => row.interval_days >= 21).length;
    const dueToday = activeProgressRows.filter((row) => row.next_review <= today).length;
    const readiness = percent(mastered, assignedQuestions);
    const teamPlayers = playerRows.map((player) => {
      const assignedQuestionIds = assignedQuestionIdsByPlayer.get(player.id) ?? new Set<string>();
      const playerProgress = progressRows.filter(
        (row) => row.player_id === player.id && assignedQuestionIds.has(row.question_id)
      );
      return {
        id: player.id,
        name: player.name,
        assignedQuestions: assignedQuestionIds.size,
        mastered: playerProgress.filter((row) => row.interval_days >= 21).length,
        dueToday: playerProgress.filter((row) => row.next_review <= today).length
      };
    });
    const latestSession = await loadLatestSession({
      supabase,
      sessions: sessions as SessionRow[],
      players: playerRows,
      activePlayerId: activePlayer.id,
      questionById,
      topicNameById
    });
    const suggestions = buildPersonalSuggestions({
      weakTopics,
      dueToday,
      reviewedLast7,
      consistencyDays,
      latestSession
    });

    const data: AnalyticsData = {
      activePlayer: {
        id: activePlayer.id,
        name: activePlayer.name
      },
      summary: {
        readiness,
        assignedQuestions,
        mastered,
        dueToday,
        reviewedLast7,
        accuracyLast7,
        consistencyDays,
        averageResponseTimeMs
      },
      metrics: [
        {
          label: "Readiness",
          value: `${readiness}%`,
          detail: `${mastered.toLocaleString()} of ${assignedQuestions.toLocaleString()} assigned cards mastered`,
          tone: readiness >= 70 ? "good" : readiness < 30 ? "warn" : "default"
        },
        {
          label: "Due today",
          value: String(dueToday),
          detail: "Scheduled reviews waiting",
          tone: dueToday > 25 ? "warn" : "default"
        },
        {
          label: "7-day volume",
          value: reviewedLast7.toLocaleString(),
          detail: `${consistencyDays} active day${consistencyDays === 1 ? "" : "s"}`,
          tone: consistencyDays >= 4 ? "good" : "warn"
        },
        {
          label: "7-day accuracy",
          value: `${accuracyLast7}%`,
          detail: `Average recall ${formatSeconds(averageResponseTimeMs)}`,
          tone: accuracyLast7 >= 80 ? "good" : accuracyLast7 < 60 ? "warn" : "default"
        }
      ],
      drillFrequency,
      weeklyDrill,
      weakTopics,
      suggestions,
      latestSession,
      team: {
        players: teamPlayers
      }
    };

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analytics unavailable." },
      { status: 500 }
    );
  }
}
