import { NextResponse } from "next/server";
import { DAILY_NEW_CARD_LIMIT } from "@/lib/constants";
import { createServiceSupabaseClient } from "@/lib/supabase";
import type { DrillQueueCard, DrillQueueData } from "@/types/drill";

export const runtime = "nodejs";

const ASSIGNED_COUNT_CACHE_TTL_MS = 5 * 60 * 1000;
const assignedCountCache = new Map<string, { count: number; expiresAt: number }>();

type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

type QueueQuestion = {
  id: string;
  topic_id: string;
  question: string;
  answer: string;
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

async function countRows(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
  label: string
) {
  const { count, error } = await query;

  if (error || count === null) {
    throw new Error(`${label}: ${error?.message ?? "missing count"}`);
  }

  return count;
}

async function countAssignedQuestions(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  topicIds: string[]
) {
  const cacheKey = [...topicIds].sort().join(",");
  const cached = assignedCountCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.count;
  }

  const count = await countRows(
    supabase.from("questions").select("id", { count: "exact", head: true }).in("topic_id", topicIds),
    "Could not count assigned questions"
  );

  assignedCountCache.set(cacheKey, {
    count,
    expiresAt: Date.now() + ASSIGNED_COUNT_CACHE_TTL_MS
  });

  return count;
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
    const today = todayDateOnly();
    const [{ data: topics, error: topicsError }, assignedQuestions, progressRows] = await Promise.all([
      supabase.from("topics").select("id, name").in("id", topicIds),
      countAssignedQuestions(supabase, topicIds),
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

    const topicNameById = new Map(topics.map((topic) => [topic.id, topic.name]));
    const dueProgressRows = progressRows
      .filter((row) => row.next_review <= today)
      .sort((left, right) => left.next_review.localeCompare(right.next_review));
    const dueProgress = dueProgressRows[0] ?? null;
    let selectedQuestion: QueueQuestion | null = null;

    if (dueProgress) {
      const { data: dueQuestion, error: dueQuestionError } = await supabase
        .from("questions")
        .select("id, topic_id, question, answer")
        .eq("id", dueProgress.question_id)
        .in("topic_id", topicIds)
        .maybeSingle();

      if (dueQuestionError) {
        return NextResponse.json({ error: dueQuestionError.message }, { status: 500 });
      }

      selectedQuestion = dueQuestion;
    }

    if (!selectedQuestion) {
      const seenQuestionIds = new Set(progressRows.map((row) => row.question_id));
      const pageSize = 100;

      for (let from = 0; ; from += pageSize) {
        const { data: questionPage, error: questionPageError } = await supabase
          .from("questions")
          .select("id, topic_id, question, answer, display_order")
          .in("topic_id", topicIds)
          .order("display_order")
          .range(from, from + pageSize - 1);

        if (questionPageError || !questionPage) {
          return NextResponse.json(
            { error: questionPageError?.message ?? "Could not load questions." },
            { status: 500 }
          );
        }

        selectedQuestion = questionPage.find((question) => !seenQuestionIds.has(question.id)) ?? null;

        if (selectedQuestion || questionPage.length < pageSize) {
          break;
        }
      }
    }

    const card: DrillQueueCard | null = selectedQuestion
      ? {
          questionId: selectedQuestion.id,
          question: selectedQuestion.question,
          answer: selectedQuestion.answer,
          topic: topicNameById.get(selectedQuestion.topic_id) ?? "Topic",
          isNew: !dueProgress,
          progress: dueProgress
            ? {
                easeFactor: dueProgress.ease_factor,
                intervalDays: dueProgress.interval_days,
                repetitions: dueProgress.repetitions
              }
            : {
                easeFactor: 2.5,
                intervalDays: 0,
                repetitions: 0
              }
        }
      : null;

    const dailyLimit = Number(process.env.PETROBOWL_DAILY_NEW_CARD_LIMIT ?? DAILY_NEW_CARD_LIMIT);
    const data: DrillQueueData = {
      card,
      stats: {
        assignedQuestions,
        dueReviews: dueProgressRows.length,
        newCards: Math.min(Math.max(assignedQuestions - progressRows.length, 0), dailyLimit),
        mastered: progressRows.filter((row) => row.interval_days >= 21).length
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
