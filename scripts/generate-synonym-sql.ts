import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GLOSSARY_TOPICS } from "@/lib/constants";
import { parseGlossaryCsv } from "@/lib/import/glossary-csv";
import { collapseSynonyms } from "@/lib/import/synonyms";

// Emits a one-time SQL backfill that applies the synonym collapse to already-seeded
// data, so it can be run in the Supabase SQL editor instead of reseeding. For each
// synonym group it rewrites the canonical row (merged/redacted definition + the full
// accepted_answers list) and deletes the now-duplicate member rows. Idempotent.
function sqlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function main() {
  const dir = path.join(process.cwd(), "data", "slb_glossary");
  const lines: string[] = [
    "-- One-time backfill: collapse synonymous glossary terms into single",
    "-- multi-answer questions on already-seeded data. Safe to run more than once.",
    "-- Run migration 0006 first (this also adds the column defensively).",
    "--",
    "-- Deleting the duplicate rows cascades to their card_progress/drill_responses,",
    "-- so only progress on the merged-away duplicates is lost; everything else is kept.",
    "",
    "alter table public.questions",
    "  add column if not exists accepted_answers text[] not null default '{}';",
    "",
    "begin;"
  ];

  let groupCount = 0;
  let deleteCount = 0;

  for (const { slug, name } of GLOSSARY_TOPICS) {
    const content = await readFile(path.join(dir, `${slug}.csv`), "utf8");
    const topic = collapseSynonyms(parseGlossaryCsv(slug, name, content));
    const merged = topic.questions.filter((q) => q.acceptedAnswers.length > 1);
    if (!merged.length) {
      continue;
    }

    const topicPredicate =
      `topic_id in (select id from public.topics ` +
      `where name = ${sqlQuote(name)} and source = 'SLB Glossary' and retired_at is null)`;

    lines.push(`-- ${name}`);
    for (const q of merged) {
      groupCount += 1;
      const others = q.acceptedAnswers.filter((answer) => answer !== q.answer);
      const acceptedArray = `array[${q.acceptedAnswers.map(sqlQuote).join(", ")}]::text[]`;

      lines.push(
        `update public.questions set question = ${sqlQuote(q.question)}, ` +
          `accepted_answers = ${acceptedArray} ` +
          `where ${topicPredicate} and answer = ${sqlQuote(q.answer)};`
      );
      if (others.length) {
        deleteCount += others.length;
        const othersList = others.map(sqlQuote).join(", ");
        // Repoint any past-session references from the duplicates to the canonical
        // row first — session_questions.question_id is ON DELETE RESTRICT.
        lines.push(
          `update public.session_questions set question_id = ` +
            `(select id from public.questions where ${topicPredicate} ` +
            `and answer = ${sqlQuote(q.answer)} order by id limit 1) ` +
            `where question_id in (select id from public.questions ` +
            `where ${topicPredicate} and answer in (${othersList}));`
        );
        lines.push(
          `delete from public.questions ` +
            `where ${topicPredicate} and answer in (${othersList});`
        );
      }
    }
    lines.push("");
  }

  lines.push("commit;");
  lines.push("");

  const outPath = path.join(process.cwd(), "supabase", "migrations", "0007_collapse_existing_synonyms.sql");
  await writeFile(outPath, lines.join("\n"), "utf8");
  console.log(`Wrote ${outPath}: ${groupCount} groups, ${deleteCount} duplicate rows removed.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
