import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceSupabaseClient } from "@/lib/supabase";
import { fetchAllPages, getAuthenticatedPlayer, loadSessionData } from "@/lib/session-server";

export const runtime = "nodejs";

const StartRequest = z.object({
  numQuestions: z.number().int().min(1).max(100).default(20)
});

function shuffle<T>(items: T[]) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
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

    const { data: topics, error: topicsError } = await supabase
      .from("topics")
      .select("id")
      .eq("team_id", player.team_id);

    if (topicsError || !topics) {
      throw new Error(topicsError?.message ?? "Could not load topics.");
    }

    const topicIds = topics.map((topic) => topic.id as string);
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

    const playerIdByTopic = new Map(assignments.map((assignment) => [assignment.topic_id, assignment.player_id]));
    const assignedTopicIds = [...playerIdByTopic.keys()];

    if (!assignedTopicIds.length) {
      return NextResponse.json({ error: "No assigned questions." }, { status: 400 });
    }

    const questions = await fetchAllPages<{ id: string; topic_id: string }>(
      (from, to) =>
        supabase
          .from("questions")
          .select("id, topic_id")
          .in("topic_id", assignedTopicIds)
          .range(from, to),
      "Could not load questions"
    );
    const selectedQuestions = shuffle(questions).slice(0, payload.data.numQuestions);

    if (!selectedQuestions.length) {
      return NextResponse.json({ error: "No assigned questions." }, { status: 400 });
    }

    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .insert({
        team_id: player.team_id,
        name: `Session ${new Date().toLocaleString("en-US", { hour12: false })}`,
        created_by: player.id,
        num_questions: selectedQuestions.length,
        status: "active"
      })
      .select("id")
      .single();

    if (sessionError || !session) {
      throw new Error(sessionError?.message ?? "Could not create session.");
    }

    const rows = selectedQuestions.map((question, index) => ({
      session_id: session.id,
      question_id: question.id,
      question_order: index + 1,
      assigned_to: playerIdByTopic.get(question.topic_id) ?? null
    }));
    const { error: questionsError } = await supabase.from("session_questions").insert(rows);

    if (questionsError) {
      await supabase.from("sessions").delete().eq("id", session.id);
      throw new Error(questionsError.message);
    }

    const data = await loadSessionData(supabase, player.team_id);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start session." },
      { status: 500 }
    );
  }
}
