import { TEAM_NAME } from "@/lib/constants";
import { createServiceSupabaseClient } from "@/lib/supabase";

// One-off provisioning script. Creates the listed people as Supabase Auth users
// and links each to a players row with role='admin' and is_player=false (pure
// hosts — they should not appear in the buzz list / dashboard / team analytics).
// Re-runnable: existing auth users and player rows are reused / upserted.
//
// Run with: tsx --env-file=.env.local scripts/create-admins.ts

const ADMIN_PASSWORD = "12345678";

const NEW_ADMINS: { email: string; name: string }[] = [
  { email: "akmal.maulanaa30@gmail.com", name: "Akmal" },
  { email: "nautaqiya@gmail.com", name: "Farah" },
  { email: "jonathanhpl.12@gmail.com", name: "Jo" },
  { email: "hoshiaiman2406@gmail.com", name: "Hoshi" },
  { email: "jamesfelix352@gmail.com", name: "Felix" },
  { email: "ramadhanalfath749@gmail.com", name: "Alfath" },
  { email: "nadya.aydan31@gmail.com", name: "Nadya" }
];

// Existing players who are pure hosts and should be flipped to is_player=false.
const EXISTING_PURE_HOSTS = ["Revanza"];

async function findUserIdByEmail(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  email: string
): Promise<string | null> {
  // listUsers is paginated; scan pages until we find the email.
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(`listUsers failed: ${error.message}`);
    }
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) {
      return match.id;
    }
    if (data.users.length < 200) {
      break;
    }
  }
  return null;
}

async function main() {
  const supabase = createServiceSupabaseClient();
  const teamName = process.env.PETROBOWL_TEAM_NAME ?? TEAM_NAME;

  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("id")
    .eq("name", teamName)
    .maybeSingle();

  if (teamError || !team) {
    throw new Error(`Could not find team "${teamName}": ${teamError?.message ?? "no row"}`);
  }

  const summary: string[] = [];

  for (const admin of NEW_ADMINS) {
    let userId: string;

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: admin.email,
      password: ADMIN_PASSWORD,
      email_confirm: true
    });

    if (createError || !created?.user) {
      // Most likely the user already exists — look them up instead.
      const existingId = await findUserIdByEmail(supabase, admin.email);
      if (!existingId) {
        throw new Error(`createUser failed for ${admin.email}: ${createError?.message ?? "unknown"}`);
      }
      userId = existingId;
      summary.push(`auth user exists: ${admin.email}`);
    } else {
      userId = created.user.id;
      summary.push(`auth user created: ${admin.email}`);
    }

    const { error: upsertError } = await supabase.from("players").upsert(
      {
        team_id: team.id,
        name: admin.name,
        role: "admin",
        is_player: false,
        user_id: userId
      },
      { onConflict: "team_id,name" }
    );

    if (upsertError) {
      throw new Error(`Upsert player ${admin.name} failed: ${upsertError.message}`);
    }
    summary.push(`player upserted (admin, is_player=false): ${admin.name}`);
  }

  // Flip existing pure hosts.
  for (const name of EXISTING_PURE_HOSTS) {
    const { data: updated, error: updateError } = await supabase
      .from("players")
      .update({ is_player: false })
      .eq("team_id", team.id)
      .eq("name", name)
      .select("id");

    if (updateError) {
      throw new Error(`Flip pure host ${name} failed: ${updateError.message}`);
    }
    if (!updated?.length) {
      summary.push(`WARNING: no player named "${name}" found — check spelling`);
    } else {
      summary.push(`pure host flipped (is_player=false): ${name}`);
    }
  }

  console.log(summary.join("\n"));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
