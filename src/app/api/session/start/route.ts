import { NextResponse } from "next/server";
import { z } from "zod";
import { drawBalancedQuestions } from "@/lib/randomizer";
import {
  buildSessionQuestionPool,
  toDatabaseTopicMode,
  type SessionPoolAssignment,
  type SessionPoolTopic,
  type SessionTopicMode
} from "@/lib/session-pool";
import { fetchAllPages, getAuthenticatedPlayer, loadSessionData } from "@/lib/session-server";
import { createServiceSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

const StartRequest = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  numQuestions: z.number().int().min(1).max(100).default(20),
  participantIds: z.array(z.string().uuid()).min(1),
  topicMode: z.enum(["topics", "playerAssigned", "playerAssignedPlus"]),
  topicIds: z.array(z.string().uuid()).optional()
});

type StartQuestionRow = {
  id: string;
  topic_id: string;
  term_key: string | null;
};

function unique(values: string[]) {
  return [...new Set(values)];
}

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^bearer\s+/i, "").trim();

  if (!token) {
    return NextResponse.json({ error: "Missing session." }, { status: 401 });
  }

  const payload = StartRequest.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  try {
    const supabase = createServiceSupabaseClient();
    const player = await getAuthenticatedPlayer(supabase, token);

    if (player.role !== "admin") {
      return NextResponse.json({ error: "Admin only." }, { status: 403 });
    }

    const participantIds = unique(payload.data.participantIds);
    const selectedTopicIds = unique(payload.data.topicIds ?? []);
    const [{ data: players, error: playersError }, { data: topics, error: topicsError }] = await Promise.all([
      supabase
        .from("players")
        .select("id")
        .eq("team_id", player.team_id)
        .eq("is_player", true),
      supabase.from("topics").select("id").eq("team_id", player.team_id)
    ]);

    if (playersError || !players) {
      throw new Error(playersError?.message ?? "Could not load players.");
    }

    if (topicsError || !topics) {
      throw new Error(topicsError?.message ?? "Could not load topics.");
    }

    const teamPlayerIds = new Set((players as { id: string }[]).map((row) => row.id));
    const invalidParticipant = participantIds.find((participantId) => !teamPlayerIds.has(participantId));

    if (invalidParticipant) {
      return NextResponse.json({ error: "Participant not found." }, { status: 400 });
    }

    const topicRows = topics as SessionPoolTopic[];
    const teamTopicIds = new Set(topicRows.map((topic) => topic.id));
    const invalidTopic = selectedTopicIds.find((topicId) => !teamTopicIds.has(topicId));

    if (invalidTopic) {
      return NextResponse.json({ error: "Topic not found." }, { status: 400 });
    }

    const topicIds = topicRows.map((topic) => topic.id);
    const { data: assignments, error: assignmentsError } = topicIds.length
      ? await supabase
          .from("topic_assignments")
          .select("topic_id, player_id")
          .in("topic_id", topicIds)
          .is("unassigned_at", null)
      : { data: [], error: null };

    if (assignmentsError || !assignments) {
      throw new Error(assignmentsError?.message ?? "Could not load assignments.");
    }

    const questions = await fetchAllPages<StartQuestionRow>(
      (from, to) =>
        supabase
          .from("questions")
          .select("id, topic_id, term_key")
          .in("topic_id", topicIds.length ? topicIds : ["00000000-0000-0000-0000-000000000000"])
          .range(from, to),
      "Could not load questions"
    );
    const pool = buildSessionQuestionPool({
      topicMode: payload.data.topicMode as SessionTopicMode,
      participantIds,
      selectedTopicIds,
      topics: topicRows,
      assignments: (assignments as { topic_id: string; player_id: string }[]).map<SessionPoolAssignment>(
        (assignment) => ({
          topicId: assignment.topic_id,
          playerId: assignment.player_id
        })
      ),
      questions: questions.map((question) => ({
        id: question.id,
        topicId: question.topic_id,
        termKey: question.term_key ?? question.id // fallback: ungrouped when null
      }))
    });

    if (payload.data.numQuestions > pool.questions.length) {
      return NextResponse.json(
        { error: `Only ${pool.questions.length} eligible question${pool.questions.length === 1 ? "" : "s"} available.` },
        { status: 400 }
      );
    }

    const selectedQuestions = drawBalancedQuestions(pool.questions, {
      count: payload.data.numQuestions
    });
    const sessionName =
      payload.data.name?.trim() ??
      `Session ${new Date().toLocaleString("en-US", { hour12: false })}`;

    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .insert({
        team_id: player.team_id,
        name: sessionName,
        created_by: player.id,
        num_questions: selectedQuestions.length,
        topic_mode: toDatabaseTopicMode(payload.data.topicMode),
        status: "active"
      })
      .select("id")
      .single();

    if (sessionError || !session) {
      throw new Error(sessionError?.message ?? "Could not create session.");
    }

    const sessionId = String(session.id);
    const participantRows = participantIds.map((participantId) => ({
      session_id: sessionId,
      player_id: participantId
    }));
    const topicRowsForInsert = [...pool.topicSources.entries()].map(([topicId, source]) => ({
      session_id: sessionId,
      topic_id: topicId,
      source
    }));
    const questionRows = selectedQuestions.map((question, index) => ({
      session_id: sessionId,
      question_id: question.id,
      question_order: index + 1,
      assigned_to: question.assignedTo,
      owners: question.owners
    }));

    const [{ error: participantInsertError }, { error: topicInsertError }, { error: questionInsertError }] =
      await Promise.all([
        supabase.from("session_participants").insert(participantRows),
        supabase.from("session_topics").insert(topicRowsForInsert),
        supabase.from("session_questions").insert(questionRows)
      ]);

    if (participantInsertError || topicInsertError || questionInsertError) {
      await supabase.from("sessions").delete().eq("id", sessionId);
      throw new Error(
        participantInsertError?.message ??
          topicInsertError?.message ??
          questionInsertError?.message ??
          "Could not create session."
      );
    }

    const data = await loadSessionData(supabase, player.team_id, sessionId);
    return NextResponse.json({ data, sessionId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start session." },
      { status: 500 }
    );
  }
}
