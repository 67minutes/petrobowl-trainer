import { readFile } from "node:fs/promises";
import path from "node:path";
import { GLOSSARY_TOPICS } from "@/lib/constants";
import { parseGlossaryCsv } from "@/lib/import/glossary-csv";
import { detectSynonymGroups } from "@/lib/import/synonyms";

// Dry-run: prints the synonym groups that seeding would merge, per topic, so the
// automatic detection can be eyeballed before reseeding. Read-only — writes nothing.
async function main() {
  const dir = path.join(process.cwd(), "data", "slb_glossary");
  let totalTerms = 0;
  let totalGroups = 0;
  let mergedTerms = 0;

  for (const { slug, name } of GLOSSARY_TOPICS) {
    const content = await readFile(path.join(dir, `${slug}.csv`), "utf8");
    const topic = parseGlossaryCsv(slug, name, content);
    const groups = detectSynonymGroups(topic.questions).filter((group) => group.length > 1);

    totalTerms += topic.questions.length;
    if (!groups.length) {
      continue;
    }

    console.log(`\n=== ${name} (${slug}) ===`);
    for (const group of groups) {
      totalGroups += 1;
      mergedTerms += group.length;
      console.log(`  • ${group.map((q) => q.answer).join("  ↔  ")}`);
    }
  }

  const collapsedTotal = totalTerms - (mergedTerms - totalGroups);
  console.log(
    `\n${totalGroups} synonym groups covering ${mergedTerms} terms.` +
      ` Question count: ${totalTerms} → ${collapsedTotal}.`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
