import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceSupabaseClient } from "@/lib/supabase";
import { getAuthenticatedPlayer, loadSessionData } from "@/lib/session-server";

export const runtime = "nodejs";

const QuestionRequest = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("correct"),
    sessionQuestionId: z.string().uuid(),
    playerId: z.string().uuid()
  }),
  z.object({
    action: z.literal("miss"),
    sessionQuestionId: z.string().uuid(),
    playerId: z.string().uuid()
  }),
  z.object({
    action: z.literal("noCorrect"),
    sessionQuestionId: z.string().uuid()
  }),
  z.object({
    action: z.literal("reset"),
    sessionQuestionId: z.string().uuid()
  })
]);

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
      .select("id, session_id, missed_by, sessions!inner(team_id, status)")
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

    if (payload.data.action === "correct" || payload.data.action === "miss") {
      const { data: buzzedPlayer, error: buzzedPlayerError } = await supabase
        .from("players")
        .select("id")
        .eq("id", payload.data.playerId)
        .eq("team_id", player.team_id)
        .maybeSingle();

      if (buzzedPlayerError) {
        throw new Error(buzzedPlayerError.message);
      }

      if (!buzzedPlayer) {
        return NextResponse.json({ error: "Player not found." }, { status: 404 });
      }
    }

    const currentMissedBy = (sessionQuestion.missed_by as string[] | null) ?? [];

    let update: { buzzed_by: string | null; correct: boolean; missed_by: string[] };

    switch (payload.data.action) {
      case "correct":
        // Someone answered correctly — the question resolves to that player.
        update = { buzzed_by: payload.data.playerId, correct: true, missed_by: currentMissedBy };
        break;
      case "miss":
        // Lock out this player but keep the question open for others.
        update = {
          buzzed_by: null,
          correct: true,
          missed_by: currentMissedBy.includes(payload.data.playerId)
            ? currentMissedBy
            : [...currentMissedBy, payload.data.playerId]
        };
        break;
      case "noCorrect":
        // No correct answer (No Buzz when empty, dead question when there were misses).
        update = { buzzed_by: null, correct: false, missed_by: currentMissedBy };
        break;
      case "reset":
        // Reopen the question and clear all buzz/lock-out state.
        update = { buzzed_by: null, correct: true, missed_by: [] };
        break;
    }

    const { error: updateError } = await supabase
      .from("session_questions")
      .update(update)
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
