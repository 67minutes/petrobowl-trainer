import { NextResponse } from "next/server";
import { DAILY_NEW_CARD_LIMIT } from "@/lib/constants";
import {
  buildTopicOptions,
  isWeakCard,
  parseDrillMode,
  resolveSelectedTopicIds,
  selectNextQuestion,
  type QueueQuestion,
  type QueueResponseStats
} from "@/lib/drill-queue";
import { createServiceSupabaseClient } from "@/lib/supabase";
import type { DrillQueueCard, DrillQueueData } from "@/types/drill";

export const runtime = "nodejs";

type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

type QueueQuestionRow = {
  id: string;
  topic_id: string;
  question: string;
  answer: string;
  accepted_answers: string[] | null;
  display_order: number;
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

function startOfTodayIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

function emptyQueue(): DrillQueueData {
  return {
    card: null,
    mode: "smart",
    selectedTopicIds: [],
    topicOptions: [],
    stats: {
      assignedQuestions: 0,
      dueReviews: 0,
      newCards: 0,
      unseenQuestions: 0,
      mastered: 0,
      weakCards: 0
    }
  };
}

function readRequestedTopicIds(searchParams: URLSearchParams) {
  return [...searchParams.getAll("topicIds"), ...searchParams.getAll("topicId")]
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

async function countNewCardsIntroducedToday(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  playerId: string
) {
  const todayStart = startOfTodayIso();
  const responsesToday = await fetchAllPages<{ question_id: string }>(
    (from, to) =>
      supabase
        .from("drill_responses")
        .select("question_id")
        .eq("player_id", playerId)
        .gte("reviewed_at", todayStart)
        .range(from, to),
    "Could not load today's responses"
  );
  const questionIdsReviewedToday = [...new Set(responsesToday.map((response) => response.question_id))];

  if (!questionIdsReviewedToday.length) {
    return 0;
  }

  const priorResponses = await fetchAllPages<{ question_id: string }>(
    (from, to) =>
      supabase
        .from("drill_responses")
        .select("question_id")
        .eq("player_id", playerId)
        .in("question_id", questionIdsReviewedToday)
        .lt("reviewed_at", todayStart)
        .range(from, to),
    "Could not load prior responses"
  );
  const questionIdsSeenBeforeToday = new Set(priorResponses.map((response) => response.question_id));

  return questionIdsReviewedToday.filter((questionId) => !questionIdsSeenBeforeToday.has(questionId)).length;
}

function buildResponseStats(
  rows: { question_id: string; rating: string; response_time_ms: number; reviewed_at: string }[],
  allowedQuestionIds: Set<string>
) {
  const totals = new Map<
    string,
    { againCount: number; responseTimeTotal: number; responseCount: number; lastReviewedAt: string | null }
  >();

  for (const row of rows) {
    if (!allowedQuestionIds.has(row.question_id)) {
      continue;
    }

    const current = totals.get(row.question_id) ?? {
      againCount: 0,
      responseTimeTotal: 0,
      responseCount: 0,
      lastReviewedAt: null
    };
    current.againCount += row.rating === "again" ? 1 : 0;
    current.responseTimeTotal += row.response_time_ms;
    current.responseCount += 1;
    current.lastReviewedAt =
      !current.lastReviewedAt || row.reviewed_at > current.lastReviewedAt ? row.reviewed_at : current.lastReviewedAt;
    totals.set(row.question_id, current);
  }

  return new Map<string, QueueResponseStats>(
    [...totals.entries()].map(([questionId, stats]) => [
      questionId,
      {
        againCount: stats.againCount,
        averageResponseTimeMs: stats.responseCount ? stats.responseTimeTotal / stats.responseCount : 0,
        lastReviewedAt: stats.lastReviewedAt
      }
    ])
  );
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

  const activeTopicIds = assignments?.map((assignment) => assignment.topic_id as string) ?? [];

  if (!activeTopicIds.length) {
    return NextResponse.json({ data: emptyQueue() });
  }

  try {
    const url = new URL(request.url);
    const searchParams = url.searchParams;
    const mode = parseDrillMode(searchParams.get("mode"));
    const limitOverride =
      searchParams.get("limitOverride") === "true" || searchParams.get("overrideLimit") === "true";
    const selectedTopicIds = resolveSelectedTopicIds(activeTopicIds, readRequestedTopicIds(searchParams));
    const today = todayDateOnly();

    const [
      { data: topicRows, error: topicsError },
      questionRows,
      progressRows,
      responseRows,
      newCardsIntroducedToday
    ] = await Promise.all([
      supabase
        .from("topics")
        .select("id, name, display_order")
        .in("id", activeTopicIds)
        .order("display_order"),
      fetchAllPages<QueueQuestionRow>(
        (from, to) =>
          supabase
            .from("questions")
            .select("id, topic_id, question, answer, accepted_answers, display_order")
            .in("topic_id", activeTopicIds)
            .order("display_order")
            .range(from, to),
        "Could not load assigned questions"
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
      ),
      fetchAllPages<{ question_id: string; rating: string; response_time_ms: number; reviewed_at: string }>(
        (from, to) =>
          supabase
            .from("drill_responses")
            .select("question_id, rating, response_time_ms, reviewed_at")
            .eq("player_id", activePlayer.id)
            .range(from, to),
        "Could not load response history"
      ),
      countNewCardsIntroducedToday(supabase, activePlayer.id)
    ]);

    if (topicsError || !topicRows) {
      return NextResponse.json({ error: topicsError?.message ?? "Could not load topics." }, { status: 500 });
    }

    const topics = topicRows.map((topic) => ({
      id: topic.id as string,
      name: topic.name as string,
      displayOrder: Number(topic.display_order ?? 0)
    }));
    const questions = questionRows.map<QueueQuestion>((question) => ({
      id: question.id,
      topicId: question.topic_id,
      question: question.question,
      answer: question.answer,
      acceptedAnswers:
        question.accepted_answers && question.accepted_answers.length > 0
          ? question.accepted_answers
          : [question.answer],
      displayOrder: Number(question.display_order ?? 0)
    }));
    const activeQuestionIds = new Set(questions.map((question) => question.id));
    const activeProgressRows = progressRows
      .filter((row) => activeQuestionIds.has(row.question_id))
      .map((row) => ({
        questionId: row.question_id,
        easeFactor: row.ease_factor,
        intervalDays: row.interval_days,
        repetitions: row.repetitions,
        nextReview: row.next_review
      }));
    const responseStatsByQuestionId = buildResponseStats(responseRows, activeQuestionIds);
    const topicOptions = buildTopicOptions(topics, questions, activeProgressRows, responseStatsByQuestionId, today);
    const selectedTopicSet = new Set(selectedTopicIds);
    const selectedQuestions = questions.filter((question) => selectedTopicSet.has(question.topicId));
    const selectedQuestionIds = new Set(selectedQuestions.map((question) => question.id));
    const selectedProgressRows = activeProgressRows.filter((row) => selectedQuestionIds.has(row.questionId));
    const selectedProgressByQuestionId = new Map(selectedProgressRows.map((row) => [row.questionId, row]));
    const selectedUnseenQuestions = selectedQuestions.filter(
      (question) => !selectedProgressByQuestionId.has(question.id)
    ).length;
    const dailyLimit = Number(process.env.PETROBOWL_DAILY_NEW_CARD_LIMIT ?? DAILY_NEW_CARD_LIMIT);
    const remainingDailyNewCards = Math.max(dailyLimit - newCardsIntroducedToday, 0);
    const remainingNewCardsToday = limitOverride
      ? selectedUnseenQuestions
      : Math.min(remainingDailyNewCards, selectedUnseenQuestions);
    const selectedQuestion = selectNextQuestion({
      mode,
      today,
      questions,
      progressRows: activeProgressRows,
      responseStatsByQuestionId,
      selectedTopicIds,
      remainingNewCardsToday
    });
    const topicNameById = new Map(topics.map((topic) => [topic.id, topic.name]));
    const selectedProgress = selectedQuestion ? selectedProgressByQuestionId.get(selectedQuestion.id) : null;
    const dueReviews = selectedProgressRows.filter((row) => row.nextReview <= today).length;
    const weakCards = selectedProgressRows.filter((row) =>
      isWeakCard(row, responseStatsByQuestionId.get(row.questionId))
    ).length;

    const card: DrillQueueCard | null =
      selectedQuestion && selectedQuestion.question && selectedQuestion.answer
        ? {
            questionId: selectedQuestion.id,
            topicId: selectedQuestion.topicId,
            question: selectedQuestion.question,
            answer: selectedQuestion.answer,
            acceptedAnswers:
              selectedQuestion.acceptedAnswers && selectedQuestion.acceptedAnswers.length > 0
                ? selectedQuestion.acceptedAnswers
                : [selectedQuestion.answer],
            topic: topicNameById.get(selectedQuestion.topicId) ?? "Topic",
            isNew: !selectedProgress,
            progress: selectedProgress
              ? {
                  easeFactor: selectedProgress.easeFactor,
                  intervalDays: selectedProgress.intervalDays,
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
      mode,
      selectedTopicIds,
      topicOptions,
      stats: {
        assignedQuestions: selectedQuestions.length,
        dueReviews,
        newCards: remainingNewCardsToday,
        unseenQuestions: selectedUnseenQuestions,
        mastered: selectedProgressRows.filter((row) => row.intervalDays >= 21).length,
        weakCards
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
