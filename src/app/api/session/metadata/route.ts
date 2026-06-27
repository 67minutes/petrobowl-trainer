import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase";
import { getAuthenticatedPlayer, loadSessionSetupData } from "@/lib/session-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^bearer\s+/i, "").trim();

  if (!token) {
    return NextResponse.json({ error: "Missing session." }, { status: 401 });
  }

  try {
    const supabase = createServiceSupabaseClient();
    const player = await getAuthenticatedPlayer(supabase, token);

    if (player.role !== "admin") {
      return NextResponse.json({ error: "Admin only." }, { status: 403 });
    }

    const data = await loadSessionSetupData(supabase, player.team_id);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Session setup unavailable." },
      { status: 500 }
    );
  }
}
