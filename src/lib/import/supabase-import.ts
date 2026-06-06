import type { SupabaseClient } from "@supabase/supabase-js";
import { SEED_PLAYERS, TEAM_NAME } from "@/lib/constants";
import { createServiceSupabaseClient } from "@/lib/supabase";
import type { ParsedQuestionBank } from "@/lib/import/excel";

export type ImportResult = {
  teamId: string;
  playerCount: number;
  topicCount: number;
  questionCount: number;
  assignmentCount: number;
};

type ImportOptions = {
  teamName?: string;
  supabase?: SupabaseClient;
};

async function upsertSingle<T>(
  query: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  label: string
): Promise<T> {
  const { data, error } = await query;
  if (error || !data) {
    throw new Error(`${label}: ${error?.message ?? "missing returned row"}`);
  }
  return data;
}

export async function importQuestionBankToSupabase(
  bank: ParsedQuestionBank,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const supabase = options.supabase ?? createServiceSupabaseClient();
  const teamName = options.teamName ?? process.env.PETROBOWL_TEAM_NAME ?? TEAM_NAME;

  const team = await upsertSingle<{ id: string }>(
    supabase.from("teams").upsert({ name: teamName }, { onConflict: "name" }).select("id").single(),
    "Upsert team"
  );

  const playerIdByName = new Map<string, string>();

  for (const player of SEED_PLAYERS) {
    const row = await upsertSingle<{ id: string }>(
      supabase
        .from("players")
        .upsert(
          {
            team_id: team.id,
            name: player.name,
            role: player.role
          },
          { onConflict: "team_id,name" }
        )
        .select("id")
        .single(),
      `Upsert player ${player.name}`
    );
    playerIdByName.set(player.name, row.id);
  }

  let questionCount = 0;
  let assignmentCount = 0;

  for (const [topicIndex, topic] of bank.topics.entries()) {
    const topicRow = await upsertSingle<{ id: string }>(
      supabase
        .from("topics")
        .upsert(
          {
            team_id: team.id,
            name: topic.name,
            display_order: topicIndex + 1
          },
          { onConflict: "team_id,name" }
        )
        .select("id")
        .single(),
      `Upsert topic ${topic.name}`
    );

    const payload = topic.questions.map((question) => ({
      topic_id: topicRow.id,
      question: question.question,
      answer: question.answer,
      metadata: question.metadata,
      display_order: question.displayOrder
    }));

    for (let index = 0; index < payload.length; index += 500) {
      const chunk = payload.slice(index, index + 500);
      const { error } = await supabase.from("questions").upsert(chunk, {
        onConflict: "topic_id,question,answer"
      });

      if (error) {
        throw new Error(`Import questions for ${topic.name}: ${error.message}`);
      }
    }

    questionCount += payload.length;

    const assignedPlayerId = topic.assignedTo ? playerIdByName.get(topic.assignedTo) : null;
    if (assignedPlayerId) {
      const now = new Date().toISOString();
      await supabase
        .from("topic_assignments")
        .update({ unassigned_at: now })
        .eq("topic_id", topicRow.id)
        .is("unassigned_at", null)
        .neq("player_id", assignedPlayerId);

      const { data: existing, error: existingError } = await supabase
        .from("topic_assignments")
        .select("id")
        .eq("topic_id", topicRow.id)
        .eq("player_id", assignedPlayerId)
        .is("unassigned_at", null)
        .limit(1);

      if (existingError) {
        throw new Error(`Check assignment for ${topic.name}: ${existingError.message}`);
      }

      if (!existing?.length) {
        const { error } = await supabase.from("topic_assignments").insert({
          topic_id: topicRow.id,
          player_id: assignedPlayerId
        });

        if (error) {
          throw new Error(`Assign topic ${topic.name}: ${error.message}`);
        }
        assignmentCount += 1;
      }
    }
  }

  return {
    teamId: team.id,
    playerCount: SEED_PLAYERS.length,
    topicCount: bank.topics.length,
    questionCount,
    assignmentCount
  };
}
