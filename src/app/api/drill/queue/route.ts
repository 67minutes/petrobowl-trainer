import { NextResponse } from "next/server";
import { DAILY_NEW_CARD_LIMIT } from "@/lib/constants";
import { createServiceSupabaseClient } from "@/lib/supabase";
import type { DrillQueueCard, DrillQueueData } from "@/types/drill";

export const runtime = "nodejs";

type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

async function fetchAllPages<T>(
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

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function emptyQueue(): DrillQueueData {
  return {
    card: null,
    stats: {
      assignedQuestions: 0,
      dueReviews: 0,
      newCards: 0,
      mastered: 0
    }
  };
}

export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^bearer\s+/i, "").trim();

  if (!token) {
    return NextResponse.json({ error: "Missing session." }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return NextResponse.json({ error: "Invalid session." }, { status: 401 });
  }

  const { data: activePlayer, error: activePlayerError } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (activePlayerError) {
    return NextResponse.json({ error: activePlayerError.message }, { status: 500 });
  }

  if (!activePlayer) {
    return NextResponse.json({ error: "No player linked." }, { status: 404 });
  }

  const { data: assignments, error: assignmentsError } = await supabase
    .from("topic_assignments")
    .select("topic_id")
    .eq("player_id", activePlayer.id)
    .is("unassigned_at", null);

  if (assignmentsError) {
    return NextResponse.json({ error: assignmentsError.message }, { status: 500 });
  }

  const topicIds = assignments?.map((assignment) => assignment.topic_id) ?? [];

  if (!topicIds.length) {
    return NextResponse.json({ data: emptyQueue() });
  }

  try {
    const [{ data: topics, error: topicsError }, questions, progressRows] = await Promise.all([
      supabase.from("topics").select("id, name").in("id", topicIds),
      fetchAllPages<{ id: string; topic_id: string; question: string; answer: string; display_order: number }>(
        (from, to) =>
          supabase
            .from("questions")
            .select("id, topic_id, question, answer, display_order")
            .in("topic_id", topicIds)
            .order("display_order")
            .range(from, to),
        "Could not load questions"
      ),
      fetchAllPages<{
        question_id: string;
        ease_factor: number;
        interval_days: number;
        repetitions: number;
        next_review: string;
      }>(
        (from, to) =>
          supabase
            .from("card_progress")
            .select("question_id, ease_factor, interval_days, repetitions, next_review")
            .eq("player_id", activePlayer.id)
            .range(from, to),
        "Could not load progress"
      )
    ]);

    if (topicsError || !topics) {
      return NextResponse.json({ error: topicsError?.message ?? "Could not load topics." }, { status: 500 });
    }

    const questionById = new Map(questions.map((question) => [question.id, question]));
    const topicNameById = new Map(topics.map((topic) => [topic.id, topic.name]));
    const assignedQuestionIds = new Set(questions.map((question) => question.id));
    const progressByQuestion = new Map(
      progressRows
        .filter((row) => assignedQuestionIds.has(row.question_id))
        .map((row) => [row.question_id, row])
    );
    const today = todayDateOnly();
    const dueRows = progressRows
      .filter((row) => assignedQuestionIds.has(row.question_id) && row.next_review <= today)
      .sort((left, right) => left.next_review.localeCompare(right.next_review));
    const newQuestions = questions.filter((question) => !progressByQuestion.has(question.id));
    const dailyLimit = Number(process.env.PETROBOWL_DAILY_NEW_CARD_LIMIT ?? DAILY_NEW_CARD_LIMIT);
    const selectedProgress = dueRows[0] ?? null;
    const selectedQuestion = selectedProgress
      ? questionById.get(selectedProgress.question_id) ?? null
      : newQuestions[0] ?? null;

    const card: DrillQueueCard | null = selectedQuestion
      ? {
          questionId: selectedQuestion.id,
          question: selectedQuestion.question,
          answer: selectedQuestion.answer,
          topic: topicNameById.get(selectedQuestion.topic_id) ?? "Topic",
          isNew: !selectedProgress,
          progress: selectedProgress
            ? {
                easeFactor: selectedProgress.ease_factor,
                intervalDays: selectedProgress.interval_days,
                repetitions: selectedProgress.repetitions
              }
            : {
                easeFactor: 2.5,
                intervalDays: 0,
                repetitions: 0
              }
        }
      : null;

    const data: DrillQueueData = {
      card,
      stats: {
        assignedQuestions: questions.length,
        dueReviews: dueRows.length,
        newCards: Math.min(newQuestions.length, dailyLimit),
        mastered: progressRows.filter(
          (row) => assignedQuestionIds.has(row.question_id) && row.interval_days >= 21
        ).length
      }
    };

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Queue unavailable." },
      { status: 500 }
    );
  }
}
