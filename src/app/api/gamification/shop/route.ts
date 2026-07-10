import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePlayer } from "@/lib/gamification/route-auth";
import { loadGamificationMe } from "@/lib/gamification/me-server";
import {
  cosmeticCoinCost,
  cosmeticDef,
  DEFAULT_COSMETICS,
  isUnlockedByProgress
} from "@/lib/gamification/cosmetics-catalog";
import { FREEZE_COST } from "@/lib/gamification/shop-constants";

export const runtime = "nodejs";

const ShopRequest = z.object({
  action: z.enum(["buy", "equip", "buyFreeze"]),
  cosmeticKey: z.string().optional()
});

export async function POST(request: Request) {
  const resolved = await resolvePlayer(request);
  if (resolved instanceof NextResponse) {
    return resolved;
  }
  const { supabase, player } = resolved;

  const parsed = ShopRequest.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { action, cosmeticKey } = parsed.data;

  const { data: gami } = await supabase
    .from("player_gamification")
    .select("coins, level, streak_freezes")
    .eq("player_id", player.id)
    .maybeSingle();
  const coins = gami?.coins ?? 0;
  const level = gami?.level ?? 1;

  if (action === "buyFreeze") {
    if (coins < FREEZE_COST) {
      return NextResponse.json({ error: "Not enough coins." }, { status: 400 });
    }
    await supabase
      .from("player_gamification")
      .update({ coins: coins - FREEZE_COST, streak_freezes: (gami?.streak_freezes ?? 0) + 1 })
      .eq("player_id", player.id);
    return respondWithSnapshot(supabase, player.id, player.team_id);
  }

  if (!cosmeticKey) {
    return NextResponse.json({ error: "Missing cosmeticKey." }, { status: 400 });
  }
  const def = cosmeticDef(cosmeticKey);
  if (!def) {
    return NextResponse.json({ error: "Unknown cosmetic." }, { status: 400 });
  }

  const { data: ownedRow } = await supabase
    .from("player_cosmetics")
    .select("id, equipped")
    .eq("player_id", player.id)
    .eq("cosmetic_key", cosmeticKey)
    .maybeSingle();
  const isDefault = DEFAULT_COSMETICS.includes(cosmeticKey);

  if (action === "buy") {
    const cost = cosmeticCoinCost(def);
    if (cost === null) {
      return NextResponse.json({ error: "This cosmetic is not purchasable." }, { status: 400 });
    }
    if (ownedRow) {
      return NextResponse.json({ error: "Already owned." }, { status: 400 });
    }
    if (coins < cost) {
      return NextResponse.json({ error: "Not enough coins." }, { status: 400 });
    }
    await supabase
      .from("player_gamification")
      .update({ coins: coins - cost })
      .eq("player_id", player.id);
    await supabase.from("player_cosmetics").insert({
      player_id: player.id,
      cosmetic_key: cosmeticKey,
      slot: def.slot,
      equipped: false
    });
    return respondWithSnapshot(supabase, player.id, player.team_id);
  }

  // action === "equip"
  const { data: achievementRows } = await supabase
    .from("player_achievements")
    .select("achievement_key")
    .eq("player_id", player.id);
  const achievements = new Set(
    ((achievementRows ?? []) as { achievement_key: string }[]).map((r) => r.achievement_key)
  );

  const allowed =
    Boolean(ownedRow) || isDefault || isUnlockedByProgress(def, { level, achievements });
  if (!allowed) {
    return NextResponse.json({ error: "Cosmetic is locked." }, { status: 400 });
  }

  // Unequip everything in this slot, then equip the chosen one (insert if not owned yet).
  await supabase
    .from("player_cosmetics")
    .update({ equipped: false })
    .eq("player_id", player.id)
    .eq("slot", def.slot);
  await supabase.from("player_cosmetics").upsert(
    {
      player_id: player.id,
      cosmetic_key: cosmeticKey,
      slot: def.slot,
      equipped: true
    },
    { onConflict: "player_id,cosmetic_key" }
  );

  return respondWithSnapshot(supabase, player.id, player.team_id);
}

async function respondWithSnapshot(supabase: SupabaseClient, playerId: string, teamId: string) {
  const data = await loadGamificationMe(supabase, playerId, teamId);
  return NextResponse.json({ data });
}
