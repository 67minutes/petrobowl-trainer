import { NextResponse } from "next/server";
import { DAILY_NEW_CARD_LIMIT, TEAM_NAME } from "@/lib/constants";
import { createServiceSupabaseClient } from "@/lib/supabase";
import type { DashboardData } from "@/types/dashboard";

export const runtime = "nodejs";

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

  let questions: { id: string; topic_id: string; answer: string }[] = [];

  try {
    questions = allTopicIds.length
      ? await fetchAllPages(
          (from, to) =>
            supabase
              .from("questions")
              .select("id, topic_id, answer")
              .in("topic_id", allTopicIds)
              .range(from, to),
          "Could not load questions"
        )
      : [];
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load questions." },
      { status: 500 }
    );
  }

  const assignedQuestionsByPlayer = new Map<string, number>();
  const assignedQuestionOwner = new Map<string, string>();
  let unownedQuestions = 0;

  for (const question of questions) {
    const ownerId = playerIdByTopic.get(question.topic_id);
    if (ownerId) {
      assignedQuestionOwner.set(question.id, ownerId);
      assignedQuestionsByPlayer.set(ownerId, (assignedQuestionsByPlayer.get(ownerId) ?? 0) + 1);
    } else if (!assignedTopicIds.has(question.topic_id)) {
      unownedQuestions += 1;
    }
  }

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

  const today = dateOnly(new Date());
  const masteredByPlayer = new Map<string, number>();
  const dueByPlayer = new Map<string, number>();
  const activeProgressByQuestion = new Map<
    string,
    { ease_factor: number; interval_days: number; next_review: string }
  >();

  for (const row of progressRows) {
    if (row.interval_days >= 21) {
      masteredByPlayer.set(row.player_id, (masteredByPlayer.get(row.player_id) ?? 0) + 1);
    }
    if (row.next_review <= today) {
      dueByPlayer.set(row.player_id, (dueByPlayer.get(row.player_id) ?? 0) + 1);
    }
    if (row.player_id === activePlayer.id) {
      activeProgressByQuestion.set(row.question_id, {
        ease_factor: row.ease_factor,
        interval_days: row.interval_days,
        next_review: row.next_review
      });
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

  const activeAssignedQuestionIds = new Set(
    [...assignedQuestionOwner.entries()]
      .filter(([, ownerId]) => ownerId === activePlayer.id)
      .map(([questionId]) => questionId)
  );

  const weakQuestionIds = [...activeProgressByQuestion.entries()]
    .filter(([questionId, row]) => activeAssignedQuestionIds.has(questionId) && (row.ease_factor < 2 || (againCountByQuestion.get(questionId) ?? 0) > 0))
    .sort((left, right) => left[1].ease_factor - right[1].ease_factor)
    .slice(0, 3)
    .map(([questionId]) => questionId);

  const topicIdsForWeakQuestions = new Set(
    questions.filter((question) => weakQuestionIds.includes(question.id)).map((question) => question.topic_id)
  );

  const { data: weakTopics } = topicIdsForWeakQuestions.size
    ? await supabase.from("topics").select("id, name").in("id", [...topicIdsForWeakQuestions])
    : { data: [] };

  const topicNameById = new Map((weakTopics ?? []).map((topic) => [topic.id, topic.name]));
  const questionById = new Map(questions.map((question) => [question.id, question]));

  const data: DashboardData = {
    activePlayerId: activePlayer.id,
    teamName: team?.name ?? TEAM_NAME,
    dailyNewCardLimit: Number(process.env.PETROBOWL_DAILY_NEW_CARD_LIMIT ?? DAILY_NEW_CARD_LIMIT),
    totalQuestions: questions.length,
    unownedQuestions,
    activity: activityDays.map(({ day, count }) => ({ day, count })),
    weakSpots: weakQuestionIds.flatMap((questionId) => {
      const question = questionById.get(questionId);
      const progress = activeProgressByQuestion.get(questionId);
      if (!question || !progress) {
        return [];
      }

      return {
        questionId,
        term: question.answer,
        topic: topicNameById.get(question.topic_id) ?? "Topic",
        ease: progress.ease_factor,
        agains: againCountByQuestion.get(questionId) ?? 0
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
