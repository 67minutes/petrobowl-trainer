import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceSupabaseClient } from "@/lib/supabase";
import { getAuthenticatedPlayer, loadSessionData } from "@/lib/session-server";

export const runtime = "nodejs";

const CompleteRequest = z.object({
  sessionId: z.string().uuid()
});

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^bearer\s+/i, "").trim();

  if (!token) {
    return NextResponse.json({ error: "Missing session." }, { status: 401 });
  }

  const payload = CompleteRequest.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  try {
    const supabase = createServiceSupabaseClient();
    const player = await getAuthenticatedPlayer(supabase, token);

    if (player.role !== "admin") {
      return NextResponse.json({ error: "Admin only." }, { status: 403 });
    }

    const { error } = await supabase
      .from("sessions")
      .update({
        status: "completed",
        completed_at: new Date().toISOString()
      })
      .eq("id", payload.data.sessionId)
      .eq("team_id", player.team_id);

    if (error) {
      throw new Error(error.message);
    }

    const data = await loadSessionData(supabase, player.team_id, payload.data.sessionId);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not complete session." },
      { status: 500 }
    );
  }
}
