// Small shared helper mirroring the inline auth block used across the API routes:
// resolve the current player from the bearer token, or return an error response.

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceSupabaseClient } from "@/lib/supabase";
import type { PlayerRole } from "@/types/database";

export type ResolvedPlayer = {
  supabase: SupabaseClient;
  player: { id: string; team_id: string; role: PlayerRole };
};

export async function resolvePlayer(request: Request): Promise<ResolvedPlayer | NextResponse> {
  const token = request.headers.get("authorization")?.replace(/^bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ error: "Missing session." }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Invalid session." }, { status: 401 });
  }

  const { data: player, error } = await supabase
    .from("players")
    .select("id, team_id, role")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!player) {
    return NextResponse.json({ error: "No player linked." }, { status: 404 });
  }

  return { supabase, player: player as ResolvedPlayer["player"] };
}
