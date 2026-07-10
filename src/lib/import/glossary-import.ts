import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GLOSSARY_TOPICS, SEED_PLAYERS, TEAM_NAME, TOPIC_OWNERS } from "@/lib/constants";
import { createServiceSupabaseClient } from "@/lib/supabase";
import { parseGlossaryCsv, type ParsedGlossaryTopic } from "@/lib/import/glossary-csv";
import { collapseSynonyms } from "@/lib/import/synonyms";

export async function loadGlossaryTopics(dir: string): Promise<ParsedGlossaryTopic[]> {
  const topics: ParsedGlossaryTopic[] = [];
  for (const { slug, name } of GLOSSARY_TOPICS) {
    const content = await readFile(path.join(dir, `${slug}.csv`), "utf8");
    // Merge synonymous terms within a topic into single multi-answer questions.
    topics.push(collapseSynonyms(parseGlossaryCsv(slug, name, content)));
  }
  return topics;
}

export function buildAssignmentPlan(
  topicIdByName: Map<string, string>,
  playerIdByName: Map<string, string>
): { topicId: string; playerId: string }[] {
  const plan: { topicId: string; playerId: string }[] = [];
  for (const [topicName, ownerNames] of Object.entries(TOPIC_OWNERS)) {
    const topicId = topicIdByName.get(topicName);
    if (!topicId) {
      continue;
    }
    for (const ownerName of ownerNames) {
      const playerId = playerIdByName.get(ownerName);
      if (playerId) {
        plan.push({ topicId, playerId });
      }
    }
  }
  return plan;
}

async function must<T>(
  query: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  label: string
): Promise<T> {
  const { data, error } = await query;
  if (error || !data) {
    throw new Error(`${label}: ${error?.message ?? "missing row"}`);
  }
  return data;
}

export async function seedGlossary(
  supabase: SupabaseClient = createServiceSupabaseClient(),
  options: { teamName?: string; dir?: string } = {}
): Promise<{ topicCount: number; questionCount: number; assignmentCount: number }> {
  const teamName = options.teamName ?? process.env.PETROBOWL_TEAM_NAME ?? TEAM_NAME;
  const dir = options.dir ?? path.join(process.cwd(), "data", "slb_glossary");

  const team = await must<{ id: string }>(
    supabase.from("teams").upsert({ name: teamName }, { onConflict: "name" }).select("id").single(),
    "Upsert team"
  );

  // Players (name, role) — upsert so ids are stable.
  const playerIdByName = new Map<string, string>();
  for (const player of SEED_PLAYERS) {
    const row = await must<{ id: string }>(
      supabase
        .from("players")
        .upsert({ team_id: team.id, name: player.name, role: player.role }, { onConflict: "team_id,name" })
        .select("id")
        .single(),
      `Upsert player ${player.name}`
    );
    playerIdByName.set(player.name, row.id);
  }

  const now = new Date().toISOString();

  // --- RETIRE existing content, KEEP sessions ---
  {
    const { error } = await supabase
      .from("topics")
      .update({ retired_at: now })
      .eq("team_id", team.id)
      .is("retired_at", null);
    if (error) throw new Error(`Retire topics: ${error.message}`);
  }
  {
    const { error } = await supabase
      .from("topic_assignments")
      .update({ unassigned_at: now })
      .is("unassigned_at", null);
    if (error) throw new Error(`Unassign topics: ${error.message}`);
  }

  // --- CLEAR SRS progress and drill history ---
  const playerIds = [...playerIdByName.values()];
  for (const table of ["card_progress", "drill_responses"] as const) {
    const { error } = await supabase.from(table).delete().in("player_id", playerIds);
    if (error) throw new Error(`Clear ${table}: ${error.message}`);
  }

  // --- SEED 21 glossary topics + questions ---
  const parsedTopics = await loadGlossaryTopics(dir);
  const topicIdByName = new Map<string, string>();
  let questionCount = 0;

  for (const [topicIndex, topic] of parsedTopics.entries()) {
    const topicRow = await must<{ id: string }>(
      supabase
        .from("topics")
        .insert({
          team_id: team.id,
          name: topic.name,
          source: "SLB Glossary",
          display_order: topicIndex + 1
        })
        .select("id")
        .single(),
      `Insert topic ${topic.name}`
    );
    topicIdByName.set(topic.name, topicRow.id);

    const payload = topic.questions.map((question) => ({
      topic_id: topicRow.id,
      question: question.question,
      answer: question.answer,
      accepted_answers: question.acceptedAnswers,
      term_key: question.termKey,
      metadata: question.metadata,
      display_order: question.displayOrder
    }));

    for (let i = 0; i < payload.length; i += 500) {
      const chunk = payload.slice(i, i + 500);
      const { error } = await supabase.from("questions").insert(chunk);
      if (error) throw new Error(`Insert questions for ${topic.name}: ${error.message}`);
    }
    questionCount += payload.length;
  }

  // --- ASSIGN topics to owners (multi-owner aware) ---
  const plan = buildAssignmentPlan(topicIdByName, playerIdByName);
  if (plan.length) {
    const { error } = await supabase
      .from("topic_assignments")
      .insert(plan.map((row) => ({ topic_id: row.topicId, player_id: row.playerId })));
    if (error) throw new Error(`Insert assignments: ${error.message}`);
  }

  return { topicCount: parsedTopics.length, questionCount, assignmentCount: plan.length };
}
