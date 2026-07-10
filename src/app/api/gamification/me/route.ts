import { NextResponse } from "next/server";
import { resolvePlayer } from "@/lib/gamification/route-auth";
import { loadGamificationMe } from "@/lib/gamification/me-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const resolved = await resolvePlayer(request);
  if (resolved instanceof NextResponse) {
    return resolved;
  }

  const { supabase, player } = resolved;
  try {
    const data = await loadGamificationMe(supabase, player.id, player.team_id);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gamification unavailable." },
      { status: 500 }
    );
  }
}
