import { NextResponse } from "next/server";
import {
  aggregateOffenseDefense,
  buildPlayerReadiness,
  buildSpeedProfile,
  buildTopicStrengthRow,
  type CoachDrillRow,
  type CoachProgressRow,
  type CoachSessionQuestion
} from "@/lib/coach";
import { fetchAllPages, getAuthenticatedPlayer } from "@/lib/session-server";
import { createServiceSupabaseClient } from "@/lib/supabase";
import type { CoachData, CoachPlayer } from "@/types/coach";

export const runtime = "nodejs";

type PlayerRow = { id: string; name: string };
type TopicRow = { id: string; name: string; display_order: number };
type AssignmentRow = { topic_id: string; player_id: string };
type QuestionRow = { id: string; topic_id: string };
type ProgressRow = { player_id: string; question_id: string; interval_days: number; next_review: string };
type DrillResponseRow = {
  player_id: string;
  question_id: string;
  correct: boolean;
  response_time_ms: number;
  reviewed_at: string;
};
type SessionQuestionRow = {
  id: string;
  session_id: string;
  question_id: string;
  assigned_to: string | null;
  buzzed_by: string | null;
  correct: boolean;
  missed_by: string[] | null;
};
type SessionParticipantRow = { session_id: string; player_id: string };

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^bearer\s+/i, "").trim();

  if (!token) {
    return NextResponse.json({ error: "Missing session." }, { status: 401 });
  }

  try {
    const supabase = createServiceSupabaseClient();
    const viewer = await getAuthenticatedPlayer(supabase, token);
    const today = todayDateOnly();
    const isAdmin = viewer.role === "admin";

    const [
      { data: players, error: playersError },
      { data: topics, error: topicsError },
      { data: assignments, error: assignmentsError },
      questionRows,
      progressRows,
      drillRows,
      { data: completedSessions, error: sessionsError }
    ] = await Promise.all([
      supabase
        .from("players")
        .select("id, name")
        .eq("team_id", viewer.team_id)
        .eq("is_player", true)
        .order("name"),
      supabase
        .from("topics")
        .select("id, name, display_order")
        .eq("team_id", viewer.team_id)
        .order("display_order"),
      supabase.from("topic_assignments").select("topic_id, player_id").is("unassigned_at", null),
      fetchAllPages<QuestionRow>(
        (from, to) => supabase.from("questions").select("id, topic_id").range(from, to),
        "Could not load questions"
      ),
      fetchAllPages<ProgressRow>(
        (from, to) =>
          supabase
            .from("card_progress")
            .select("player_id, question_id, interval_days, next_review")
            .range(from, to),
        "Could not load progress"
      ),
      fetchAllPages<DrillResponseRow>(
        (from, to) =>
          supabase
            .from("drill_responses")
            .select("player_id, question_id, correct, response_time_ms, reviewed_at")
            .range(from, to),
        "Could not load drill responses"
      ),
      supabase
        .from("sessions")
        .select("id")
        .eq("team_id", viewer.team_id)
        .eq("status", "completed")
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
    if (sessionsError || !completedSessions) {
      return NextResponse.json({ error: sessionsError?.message ?? "Could not load sessions." }, { status: 500 });
    }

    const playerRows = players as PlayerRow[];
    const topicRows = topics as TopicRow[];
    const assignmentRows = assignments as AssignmentRow[];
    const teamTopicIds = new Set(topicRows.map((topic) => topic.id));
    const teamQuestionRows = questionRows.filter((question) => teamTopicIds.has(question.topic_id));
    const topicByQuestionId = new Map(teamQuestionRows.map((question) => [question.id, question.topic_id]));

    // Question ids per topic, then assigned question ids + owned topics per player.
    const questionIdsByTopic = new Map<string, string[]>();
    for (const question of teamQuestionRows) {
      questionIdsByTopic.set(question.topic_id, [
        ...(questionIdsByTopic.get(question.topic_id) ?? []),
        question.id
      ]);
    }

    const ownedTopicIdsByPlayer = new Map<string, Set<string>>();
    for (const assignment of assignmentRows) {
      if (!teamTopicIds.has(assignment.topic_id)) {
        continue;
      }
      const owned = ownedTopicIdsByPlayer.get(assignment.player_id) ?? new Set<string>();
      owned.add(assignment.topic_id);
      ownedTopicIdsByPlayer.set(assignment.player_id, owned);
    }

    const assignedQuestionIdsByPlayer = new Map<string, Set<string>>();
    for (const player of playerRows) {
      const questionIds = new Set<string>();
      for (const topicId of ownedTopicIdsByPlayer.get(player.id) ?? []) {
        for (const questionId of questionIdsByTopic.get(topicId) ?? []) {
          questionIds.add(questionId);
        }
      }
      assignedQuestionIdsByPlayer.set(player.id, questionIds);
    }

    // Load questions from all completed sessions, then attach a topic id to each.
    const completedSessionIds = (completedSessions as { id: string }[]).map((session) => session.id);
    let sessionQuestions: CoachSessionQuestion[] = [];
    const participatingSessionIdsByPlayer = new Map<string, Set<string>>();

    if (completedSessionIds.length) {
      const [rawSessionQuestions, { data: sessionParticipants, error: sessionParticipantsError }] =
        await Promise.all([
          fetchAllPages<SessionQuestionRow>(
            (from, to) =>
              supabase
                .from("session_questions")
                .select("id, session_id, question_id, assigned_to, buzzed_by, correct, missed_by")
                .in("session_id", completedSessionIds)
                .range(from, to),
            "Could not load session questions"
          ),
          supabase
            .from("session_participants")
            .select("session_id, player_id")
            .in("session_id", completedSessionIds)
        ]);

      if (sessionParticipantsError || !sessionParticipants) {
        throw new Error(sessionParticipantsError?.message ?? "Could not load session participants.");
      }

      for (const row of sessionParticipants as SessionParticipantRow[]) {
        const sessionIds = participatingSessionIdsByPlayer.get(row.player_id) ?? new Set<string>();
        sessionIds.add(row.session_id);
        participatingSessionIdsByPlayer.set(row.player_id, sessionIds);
      }

      sessionQuestions = rawSessionQuestions.map((row) => ({
        id: row.id,
        sessionId: row.session_id,
        topicId: topicByQuestionId.get(row.question_id) ?? null,
        assignedTo: row.assigned_to,
        buzzedBy: row.buzzed_by,
        correct: row.correct,
        missedBy: row.missed_by ?? []
      }));
    }

    const coachDrillRows: CoachDrillRow[] = (drillRows as DrillResponseRow[]).map((row) => ({
      playerId: row.player_id,
      questionId: row.question_id,
      correct: row.correct,
      responseTimeMs: row.response_time_ms,
      reviewedAt: row.reviewed_at
    }));
    const coachProgressRows: CoachProgressRow[] = (progressRows as ProgressRow[]).map((row) => ({
      playerId: row.player_id,
      questionId: row.question_id,
      intervalDays: row.interval_days,
      nextReview: row.next_review
    }));

    // Role boundary: admins see everyone; a player only ever gets their own row.
    const targetPlayers = isAdmin ? playerRows : playerRows.filter((player) => player.id === viewer.id);

    const coachPlayers: CoachPlayer[] = targetPlayers.map((player) => {
      const playerSessionIds = participatingSessionIdsByPlayer.get(player.id) ?? new Set<string>();
      const playerSessionQuestions = sessionQuestions.filter((question) => playerSessionIds.has(question.sessionId));

      return {
        id: player.id,
        name: player.name,
        readiness: buildPlayerReadiness({
          playerId: player.id,
          assignedQuestionIds: assignedQuestionIdsByPlayer.get(player.id) ?? new Set<string>(),
          progressRows: coachProgressRows,
          drillRows: coachDrillRows,
          today
        }),
        speed: buildSpeedProfile(player.id, coachDrillRows),
        offenseDefense: aggregateOffenseDefense({ id: player.id, name: player.name }, playerSessionQuestions),
        topicStrength: buildTopicStrengthRow({
          playerId: player.id,
          topics: topicRows,
          topicByQuestionId,
          drillRows: coachDrillRows,
          sessionQuestions: playerSessionQuestions,
          ownedTopicIds: ownedTopicIdsByPlayer.get(player.id) ?? new Set<string>()
        })
      };
    });

    const data: CoachData = {
      viewer: { id: viewer.id, role: viewer.role },
      topics: topicRows.map((topic) => ({ id: topic.id, name: topic.name })),
      players: coachPlayers
    };

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Coach analytics unavailable." },
      { status: 500 }
    );
  }
}
