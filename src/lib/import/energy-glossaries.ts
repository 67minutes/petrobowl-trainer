import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ENERGY_GLOSSARY_TOPICS, TEAM_NAME } from "@/lib/constants";
import { createServiceSupabaseClient } from "@/lib/supabase";
import { parseGlossaryCsv, type ParsedGlossaryTopic } from "@/lib/import/glossary-csv";
import { collapseSynonyms } from "@/lib/import/synonyms";

export type EnergyTopicConfig = { slug: string; name: string; source: string };

// Decides which energy topics to insert vs skip, and where to slot them in the
// display order. Pure so the additive/idempotent contract is directly testable:
// topics already present are skipped, new ones are numbered after the current max.
export function planEnergyTopics(
  configured: EnergyTopicConfig[],
  existing: { name: string; display_order: number }[]
): { toInsert: (EnergyTopicConfig & { displayOrder: number })[]; skipped: string[] } {
  const existingNames = new Set(existing.map((topic) => topic.name));
  let nextOrder = existing.reduce((max, topic) => Math.max(max, topic.display_order), 0);
  const toInsert: (EnergyTopicConfig & { displayOrder: number })[] = [];
  const skipped: string[] = [];
  for (const topic of configured) {
    if (existingNames.has(topic.name)) {
      skipped.push(topic.name);
      continue;
    }
    nextOrder += 1;
    toInsert.push({ ...topic, displayOrder: nextOrder });
  }
  return { toInsert, skipped };
}

async function loadEnergyTopic(dir: string, slug: string, name: string): Promise<ParsedGlossaryTopic> {
  const content = await readFile(path.join(dir, `${slug}.csv`), "utf8");
  return collapseSynonyms(parseGlossaryCsv(slug, name, content));
}

// Adds the public-domain energy glossaries as study-only topics WITHOUT touching
// anything the SLB seed owns: it does not retire topics, delete card_progress /
// drill_responses, or create topic_assignments. Re-running is idempotent — topics
// that already exist are left as-is.
export async function seedEnergyGlossaries(
  supabase: SupabaseClient = createServiceSupabaseClient(),
  options: { teamName?: string; dir?: string } = {}
): Promise<{ inserted: { name: string; questionCount: number }[]; skipped: string[] }> {
  const teamName = options.teamName ?? process.env.PETROBOWL_TEAM_NAME ?? TEAM_NAME;
  const dir = options.dir ?? path.join(process.cwd(), "data", "energy_glossaries");

  // The team is created by the main glossary seed; these topics layer on top of it.
  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("id")
    .eq("name", teamName)
    .single();
  if (teamError || !team) {
    throw new Error(
      `Team "${teamName}" not found — run \`npm run seed:glossary\` first: ${teamError?.message ?? "missing row"}`
    );
  }

  const { data: existing, error: existingError } = await supabase
    .from("topics")
    .select("name, display_order")
    .eq("team_id", team.id)
    .is("retired_at", null);
  if (existingError) {
    throw new Error(`List existing topics: ${existingError.message}`);
  }

  const { toInsert, skipped } = planEnergyTopics(ENERGY_GLOSSARY_TOPICS, existing ?? []);

  const inserted: { name: string; questionCount: number }[] = [];
  for (const topic of toInsert) {
    const parsed = await loadEnergyTopic(dir, topic.slug, topic.name);

    const { data: topicRow, error: topicError } = await supabase
      .from("topics")
      .insert({
        team_id: team.id,
        name: topic.name,
        source: topic.source,
        display_order: topic.displayOrder
      })
      .select("id")
      .single();
    if (topicError || !topicRow) {
      throw new Error(`Insert topic ${topic.name}: ${topicError?.message ?? "missing row"}`);
    }

    const payload = parsed.questions.map((question) => ({
      topic_id: topicRow.id,
      question: question.question,
      answer: question.answer,
      accepted_answers: question.acceptedAnswers,
      term_key: question.termKey,
      metadata: question.metadata,
      display_order: question.displayOrder
    }));

    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await supabase.from("questions").insert(payload.slice(i, i + 500));
      if (error) {
        throw new Error(`Insert questions for ${topic.name}: ${error.message}`);
      }
    }
    inserted.push({ name: topic.name, questionCount: payload.length });
  }

  return { inserted, skipped };
}
