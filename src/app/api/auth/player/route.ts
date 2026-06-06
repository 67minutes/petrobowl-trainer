import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^bearer\s+/i, "").trim();

  if (!token) {
    return NextResponse.json({ player: null, error: "Missing session." }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return NextResponse.json({ player: null, error: "Invalid session." }, { status: 401 });
  }

  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("id,team_id,user_id,name,role")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (playerError) {
    return NextResponse.json({ player: null, error: playerError.message }, { status: 500 });
  }

  return NextResponse.json({ player });
}
