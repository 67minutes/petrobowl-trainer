import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceSupabaseClient } from "@/lib/supabase";
import { reviewCard } from "@/lib/sm2";
import { awardForReview } from "@/lib/gamification/award-server";
import type { AwardSummary } from "@/types/gamification";

const ReviewRequest = z.object({
  questionId: z.string().uuid(),
  rating: z.enum(["again", "hard", "good", "easy"]),
  responseTimeMs: z.number().int().min(0).default(0)
});

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^bearer\s+/i, "").trim();

  if (!token) {
    return NextResponse.json({ error: "Missing session." }, { status: 401 });
  }

  const payload = ReviewRequest.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return NextResponse.json({ error: "Invalid session." }, { status: 401 });
  }

  const { data: activePlayer, error: activePlayerError } = await supabase
    .from("players")
    .select("id, team_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (activePlayerError) {
    return NextResponse.json({ error: activePlayerError.message }, { status: 500 });
  }

  if (!activePlayer) {
    return NextResponse.json({ error: "No player linked." }, { status: 404 });
  }

  const { questionId, rating, responseTimeMs } = payload.data;
  const { data: question, error: questionError } = await supabase
    .from("questions")
    .select("id, topic_id")
    .eq("id", questionId)
    .maybeSingle();

  if (questionError) {
    return NextResponse.json({ error: questionError.message }, { status: 500 });
  }

  if (!question) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 });
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from("topic_assignments")
    .select("id")
    .eq("topic_id", question.topic_id)
    .eq("player_id", activePlayer.id)
    .is("unassigned_at", null)
    .maybeSingle();

  if (assignmentError) {
    return NextResponse.json({ error: assignmentError.message }, { status: 500 });
  }

  if (!assignment) {
    return NextResponse.json({ error: "Question not assigned." }, { status: 403 });
  }

  const { data: progress, error: progressError } = await supabase
    .from("card_progress")
    .select("ease_factor, interval_days, repetitions")
    .eq("player_id", activePlayer.id)
    .eq("question_id", questionId)
    .maybeSingle();

  if (progressError) {
    return NextResponse.json({ error: progressError.message }, { status: 500 });
  }

  const reviewed = reviewCard(
    {
      easeFactor: progress?.ease_factor ?? 2.5,
      intervalDays: progress?.interval_days ?? 0,
      repetitions: progress?.repetitions ?? 0
    },
    rating
  );

  const { error: upsertError } = await supabase.from("card_progress").upsert(
    {
      player_id: activePlayer.id,
      question_id: questionId,
      ease_factor: reviewed.easeFactor,
      interval_days: reviewed.intervalDays,
      repetitions: reviewed.repetitions,
      next_review: reviewed.nextReview,
      last_reviewed: reviewed.lastReviewed
    },
    { onConflict: "player_id,question_id" }
  );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  const { error: responseError } = await supabase.from("drill_responses").insert({
    player_id: activePlayer.id,
    question_id: questionId,
    correct: rating !== "again",
    rating,
    response_time_ms: responseTimeMs,
    reviewed_at: reviewed.lastReviewed
  });

  if (responseError) {
    return NextResponse.json({ error: responseError.message }, { status: 500 });
  }

  // Gamification is best-effort and never blocks the SRS write above.
  let award: AwardSummary | null = null;
  try {
    award = await awardForReview(supabase, {
      playerId: activePlayer.id,
      teamId: activePlayer.team_id,
      rating,
      priorIntervalDays: progress?.interval_days ?? 0,
      newIntervalDays: reviewed.intervalDays,
      wasNew: !progress,
      reviewedAtISO: reviewed.lastReviewed
    });
  } catch (awardError) {
    console.error("gamification award failed", awardError);
  }

  return NextResponse.json({
    result: {
      nextReview: reviewed.nextReview,
      intervalDays: reviewed.intervalDays,
      easeFactor: reviewed.easeFactor
    },
    award
  });
}
