import { NextResponse } from "next/server";
import { parseQuestionBank, summarizeQuestionBank } from "@/lib/import/excel";
import { importQuestionBankToSupabase } from "@/lib/import/supabase-import";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const dryRun = formData.get("dryRun") !== "false";
    const teamName = String(formData.get("teamName") ?? "").trim() || undefined;

    if (!(file instanceof File)) {
      return NextResponse.json({ dryRun, error: "Upload a workbook file." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseQuestionBank(buffer);
    const summary = summarizeQuestionBank(parsed);

    if (dryRun) {
      return NextResponse.json({ dryRun: true, summary });
    }

    const result = await importQuestionBankToSupabase(parsed, { teamName });
    return NextResponse.json({ dryRun: false, summary, result });
  } catch (error) {
    return NextResponse.json(
      { dryRun: true, error: error instanceof Error ? error.message : "Unknown import error" },
      { status: 500 }
    );
  }
}
