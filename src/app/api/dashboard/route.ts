import { NextResponse } from "next/server";
import { DAILY_NEW_CARD_LIMIT, TEAM_NAME } from "@/lib/constants";
import { createServiceSupabaseClient } from "@/lib/supabase";
import type { DashboardData } from "@/types/dashboard";

export const runtime = "nodejs";

const QUESTION_COUNT_CACHE_TTL_MS = 5 * 60 * 1000;
const questionCountCache = new Map<string, { counts: Map<string, number>; expiresAt: number }>();

function startOfTodayIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function lastActivityDays() {
  const today = new Date();
  return Array.from({ length: 35 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (34 - index));
    return {
      day: index + 1,
      date: dateOnly(date),
      count: 0
    };
  });
}

async function fetchAllPages<T>(
  loadPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
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

async function countQuestionsByTopic(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  topicIds: string[]
) {
  const cacheKey = [...topicIds].sort().join(",");
  const cached = questionCountCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.counts;
  }

  const counts = await Promise.all(
    topicIds.map(async (topicId) => {
      const count = await countRows(
        supabase.from("questions").select("id", { count: "exact", head: true }).eq("topic_id", topicId),
        "Could not count questions"
      );
      return [topicId, count] as const;
    })
  );

  const countMap = new Map(counts);
  questionCountCache.set(cacheKey, {
    counts: countMap,
    expiresAt: Date.now() + QUESTION_COUNT_CACHE_TTL_MS
  });

  return countMap;
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
    .select("id, team_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (activePlayerError) {
    return NextResponse.json({ error: activePlayerError.message }, { status: 500 });
  }

  if (!activePlayer) {
    return NextResponse.json({ error: "No player linked." }, { status: 404 });
  }

  const { data: team } = await supabase
    .from("teams")
    .select("name")
    .eq("id", activePlayer.team_id)
    .maybeSingle();

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, name, role")
    .eq("team_id", activePlayer.team_id)
    .eq("is_player", true)
    .order("name");

  if (playersError || !players) {
    return NextResponse.json({ error: playersError?.message ?? "Could not load players." }, { status: 500 });
  }

  const playerIds = players.map((player) => player.id);

  const { data: topics, error: topicsError } = await supabase
    .from("topics")
    .select("id")
    .eq("team_id", activePlayer.team_id);

  if (topicsError) {
    return NextResponse.json({ error: topicsError.message }, { status: 500 });
  }

  const allTopicIds = topics?.map((topic) => topic.id) ?? [];

  const { data: assignments, error: assignmentsError } = await supabase
    .from("topic_assignments")
    .select("topic_id, player_id")
    .in("player_id", playerIds)
    .is("unassigned_at", null);

  if (assignmentsError) {
    return NextResponse.json({ error: assignmentsError.message }, { status: 500 });
  }

  const assignedTopicIds = new Set(assignments?.map((assignment) => assignment.topic_id) ?? []);
  const playerIdByTopic = new Map<string, string>();
  const topicCountByPlayer = new Map<string, number>();

  for (const assignment of assignments ?? []) {
    playerIdByTopic.set(assignment.topic_id, assignment.player_id);
    topicCountByPlayer.set(assignment.player_id, (topicCountByPlayer.get(assignment.player_id) ?? 0) + 1);
  }

  let questionCountByTopic = new Map<string, number>();
  const assignedQuestionsByPlayer = new Map<string, number>();
  let unownedQuestions = 0;

  try {
    questionCountByTopic = await countQuestionsByTopic(supabase, allTopicIds);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not count questions." },
      { status: 500 }
    );
  }

  for (const topicId of allTopicIds) {
    const questionCount = questionCountByTopic.get(topicId) ?? 0;
    const ownerId = playerIdByTopic.get(topicId);
    if (ownerId) {
      assignedQuestionsByPlayer.set(ownerId, (assignedQuestionsByPlayer.get(ownerId) ?? 0) + questionCount);
    } else if (!assignedTopicIds.has(topicId)) {
      unownedQuestions += questionCount;
    }
  }

  const today = dateOnly(new Date());
  const masteredByPlayer = new Map<string, number>();
  const dueByPlayer = new Map<string, number>();
  let progressRows: {
    player_id: string;
    question_id: string;
    ease_factor: number;
    interval_days: number;
    next_review: string;
  }[] = [];

  try {
    progressRows = playerIds.length
      ? await fetchAllPages(
          (from, to) =>
            supabase
              .from("card_progress")
              .select("player_id, question_id, ease_factor, interval_days, next_review")
              .in("player_id", playerIds)
              .range(from, to),
          "Could not load progress"
        )
      : [];
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load progress." },
      { status: 500 }
    );
  }

  const activeAssignedTopicIds = (assignments ?? [])
    .filter((assignment) => assignment.player_id === activePlayer.id)
    .map((assignment) => assignment.topic_id);

  for (const row of progressRows) {
    if (row.interval_days >= 21) {
      masteredByPlayer.set(row.player_id, (masteredByPlayer.get(row.player_id) ?? 0) + 1);
    }
    if (row.next_review <= today) {
      dueByPlayer.set(row.player_id, (dueByPlayer.get(row.player_id) ?? 0) + 1);
    }
  }

  const since = new Date();
  since.setDate(since.getDate() - 34);
  const activityDays = lastActivityDays();
  const activityByDate = new Map(activityDays.map((day) => [day.date, day]));
  const todayStart = startOfTodayIso();

  let responses: { player_id: string; question_id: string; rating: string; reviewed_at: string }[] = [];

  try {
    responses = await fetchAllPages(
      (from, to) =>
        supabase
          .from("drill_responses")
          .select("player_id, question_id, rating, reviewed_at")
          .eq("player_id", activePlayer.id)
          .gte("reviewed_at", since.toISOString())
          .range(from, to),
      "Could not load responses"
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load responses." },
      { status: 500 }
    );
  }

  const reviewedTodayByPlayer = new Map<string, number>();
  const againCountByQuestion = new Map<string, number>();

  for (const response of responses) {
    const day = activityByDate.get(String(response.reviewed_at).slice(0, 10));
    if (day) {
      day.count += 1;
    }
    if (response.reviewed_at >= todayStart) {
      reviewedTodayByPlayer.set(response.player_id, (reviewedTodayByPlayer.get(response.player_id) ?? 0) + 1);
    }
    if (response.rating === "again") {
      againCountByQuestion.set(response.question_id, (againCountByQuestion.get(response.question_id) ?? 0) + 1);
    }
  }

  const weakCandidates = progressRows
    .filter(
      (row) =>
        row.player_id === activePlayer.id &&
        (row.ease_factor < 2 || (againCountByQuestion.get(row.question_id) ?? 0) > 0)
    )
    .map((row) => ({
      questionId: row.question_id,
      ease_factor: row.ease_factor,
      interval_days: row.interval_days,
      next_review: row.next_review
    }));

  const weakRows = weakCandidates
    .sort((left, right) => {
      const easeDifference = left.ease_factor - right.ease_factor;
      if (easeDifference !== 0) {
        return easeDifference;
      }
      return (againCountByQuestion.get(right.questionId) ?? 0) - (againCountByQuestion.get(left.questionId) ?? 0);
    })
    .slice(0, 10);

  let weakQuestions: { id: string; topic_id: string; answer: string }[] = [];

  if (weakRows.length && activeAssignedTopicIds.length) {
    const { data: questionRows, error: questionRowsError } = await supabase
      .from("questions")
      .select("id, topic_id, answer")
      .in(
        "id",
        weakRows.map((row) => row.questionId)
      )
      .in("topic_id", activeAssignedTopicIds);

    if (questionRowsError) {
      return NextResponse.json({ error: questionRowsError.message }, { status: 500 });
    }

    weakQuestions = questionRows ?? [];
  }

  const weakQuestionById = new Map(weakQuestions.map((question) => [question.id, question]));
  const selectedWeakRows = weakRows.filter((row) => weakQuestionById.has(row.questionId)).slice(0, 3);
  const topicIdsForWeakQuestions = new Set(weakQuestions.map((question) => question.topic_id));

  const { data: weakTopics } = topicIdsForWeakQuestions.size
    ? await supabase.from("topics").select("id, name").in("id", [...topicIdsForWeakQuestions])
    : { data: [] };

  const topicNameById = new Map((weakTopics ?? []).map((topic) => [topic.id, topic.name]));
  const totalQuestions = [...questionCountByTopic.values()].reduce((sum, count) => sum + count, 0);

  const data: DashboardData = {
    activePlayerId: activePlayer.id,
    teamName: team?.name ?? TEAM_NAME,
    dailyNewCardLimit: Number(process.env.PETROBOWL_DAILY_NEW_CARD_LIMIT ?? DAILY_NEW_CARD_LIMIT),
    totalQuestions,
    unownedQuestions,
    activity: activityDays.map(({ day, count }) => ({ day, count })),
    weakSpots: selectedWeakRows.flatMap((row) => {
      const question = weakQuestionById.get(row.questionId);
      if (!question) {
        return [];
      }

      return {
        questionId: row.questionId,
        term: question.answer,
        topic: topicNameById.get(question.topic_id) ?? "Topic",
        ease: row.ease_factor,
        agains: againCountByQuestion.get(row.questionId) ?? 0
      };
    }),
    players: players.map((player) => ({
      id: player.id,
      name: player.name,
      role: player.role,
      topicCount: topicCountByPlayer.get(player.id) ?? 0,
      assignedQuestions: assignedQuestionsByPlayer.get(player.id) ?? 0,
      mastered: masteredByPlayer.get(player.id) ?? 0,
      dueToday: dueByPlayer.get(player.id) ?? 0,
      reviewedToday:
        player.id === activePlayer.id ? reviewedTodayByPlayer.get(player.id) ?? 0 : 0
    }))
  };

  return NextResponse.json({ data });
}
