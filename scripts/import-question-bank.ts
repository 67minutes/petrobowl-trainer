import { readFile } from "node:fs/promises";
import { parseQuestionBank, summarizeQuestionBank } from "@/lib/import/excel";
import { importQuestionBankToSupabase } from "@/lib/import/supabase-import";

async function main() {
  const [filePath, ...flags] = process.argv.slice(2);
  const dryRun = flags.includes("--dry-run") || !flags.includes("--supabase");

  if (!filePath) {
    throw new Error("Usage: tsx scripts/import-question-bank.ts <workbook.xlsx> [--dry-run|--supabase]");
  }

  const buffer = await readFile(filePath);
  const parsed = await parseQuestionBank(buffer);
  const summary = summarizeQuestionBank(parsed);

  console.log(JSON.stringify(summary, null, 2));

  if (!dryRun) {
    const result = await importQuestionBankToSupabase(parsed);
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
