import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceSupabaseClient } from "@/lib/supabase";
import { getAuthenticatedPlayer, loadSessionData } from "@/lib/session-server";

export const runtime = "nodejs";

const QuestionRequest = z.object({
  sessionQuestionId: z.string().uuid(),
  buzzedBy: z.string().uuid().nullable(),
  correct: z.boolean()
});

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^bearer\s+/i, "").trim();

  if (!token) {
    return NextResponse.json({ error: "Missing session." }, { status: 401 });
  }

  const payload = QuestionRequest.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  try {
    const supabase = createServiceSupabaseClient();
    const player = await getAuthenticatedPlayer(supabase, token);

    if (player.role !== "admin") {
      return NextResponse.json({ error: "Admin only." }, { status: 403 });
    }

    const { data: sessionQuestion, error: sessionQuestionError } = await supabase
      .from("session_questions")
      .select("id, session_id, sessions!inner(team_id, status)")
      .eq("id", payload.data.sessionQuestionId)
      .maybeSingle();

    if (sessionQuestionError) {
      throw new Error(sessionQuestionError.message);
    }

    if (!sessionQuestion) {
      return NextResponse.json({ error: "Question not found." }, { status: 404 });
    }

    const session = Array.isArray(sessionQuestion.sessions)
      ? sessionQuestion.sessions[0]
      : sessionQuestion.sessions;

    if (!session || session.team_id !== player.team_id) {
      return NextResponse.json({ error: "Question not found." }, { status: 404 });
    }

    if (session.status === "completed") {
      return NextResponse.json({ error: "Session completed." }, { status: 400 });
    }

    if (payload.data.buzzedBy) {
      const { data: buzzedPlayer, error: buzzedPlayerError } = await supabase
        .from("players")
        .select("id")
        .eq("id", payload.data.buzzedBy)
        .eq("team_id", player.team_id)
        .maybeSingle();

      if (buzzedPlayerError) {
        throw new Error(buzzedPlayerError.message);
      }

      if (!buzzedPlayer) {
        return NextResponse.json({ error: "Player not found." }, { status: 404 });
      }
    }

    const { error: updateError } = await supabase
      .from("session_questions")
      .update({
        buzzed_by: payload.data.buzzedBy,
        correct: payload.data.correct
      })
      .eq("id", payload.data.sessionQuestionId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    const data = await loadSessionData(supabase, player.team_id);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update question." },
      { status: 500 }
    );
  }
}
