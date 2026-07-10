-- Gamification layer. Sits entirely on top of the SRS: reads drill_responses / card_progress,
-- writes only these new tables. Nothing here alters scheduling (sm2 / drill-queue / card_progress).
-- Idempotent so it can be re-run in the Supabase SQL editor.

-- Per-player running game state (one row per player, lazily created on first drill).
create table if not exists public.player_gamification (
  player_id uuid primary key references public.players(id) on delete cascade,
  xp bigint not null default 0 check (xp >= 0),
  level int not null default 1 check (level >= 1),
  coins int not null default 0 check (coins >= 0),
  current_streak int not null default 0 check (current_streak >= 0),
  longest_streak int not null default 0 check (longest_streak >= 0),
  last_active_date date,
  current_combo int not null default 0 check (current_combo >= 0),
  streak_freezes int not null default 0 check (streak_freezes >= 0),
  updated_at timestamptz not null default now()
);

-- Generated daily quests (3 per player per day). Progress advanced server-side per review.
create table if not exists public.daily_quests (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  quest_date date not null default current_date,
  quest_key text not null,
  target int not null check (target > 0),
  progress int not null default 0 check (progress >= 0),
  reward_xp int not null default 0 check (reward_xp >= 0),
  reward_coins int not null default 0 check (reward_coins >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (player_id, quest_date, quest_key)
);

create index if not exists daily_quests_player_date_idx
  on public.daily_quests (player_id, quest_date);

-- Unlocked milestones / badges (unlock-once).
create table if not exists public.player_achievements (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  achievement_key text not null,
  unlocked_at timestamptz not null default now(),
  unique (player_id, achievement_key)
);

-- Owned + equipped cosmetics (themes, sound packs, mascots, frames, badges).
create table if not exists public.player_cosmetics (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  cosmetic_key text not null,
  slot text not null,
  equipped boolean not null default false,
  acquired_at timestamptz not null default now(),
  unique (player_id, cosmetic_key)
);

create index if not exists player_cosmetics_player_idx
  on public.player_cosmetics (player_id);

-- Weekly shared team challenge + one-time reward guard (rewarded_player_ids).
create table if not exists public.team_challenges (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  week_start date not null,
  challenge_key text not null,
  target int not null check (target > 0),
  reward_xp int not null default 0 check (reward_xp >= 0),
  reward_coins int not null default 0 check (reward_coins >= 0),
  completed_at timestamptz,
  rewarded_player_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (team_id, week_start, challenge_key)
);

-- Row Level Security. App writes go through the service-role client, but policies mirror
-- the existing card_progress / drill_responses model (see 0001) for correctness/parity.
alter table public.player_gamification enable row level security;
alter table public.daily_quests enable row level security;
alter table public.player_achievements enable row level security;
alter table public.player_cosmetics enable row level security;
alter table public.team_challenges enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'player_gamification' and policyname = 'Players manage own gamification') then
    create policy "Players manage own gamification" on public.player_gamification
      for all using (player_id = public.current_player_id())
      with check (player_id = public.current_player_id());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'player_gamification' and policyname = 'Team views gamification') then
    create policy "Team views gamification" on public.player_gamification
      for select using (
        exists (
          select 1
          from public.players owner
          join public.players viewer on viewer.team_id = owner.team_id
          where owner.id = player_gamification.player_id and viewer.user_id = auth.uid()
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'daily_quests' and policyname = 'Players manage own quests') then
    create policy "Players manage own quests" on public.daily_quests
      for all using (player_id = public.current_player_id())
      with check (player_id = public.current_player_id());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'player_achievements' and policyname = 'Players manage own achievements') then
    create policy "Players manage own achievements" on public.player_achievements
      for all using (player_id = public.current_player_id())
      with check (player_id = public.current_player_id());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'player_achievements' and policyname = 'Team views achievements') then
    create policy "Team views achievements" on public.player_achievements
      for select using (
        exists (
          select 1
          from public.players owner
          join public.players viewer on viewer.team_id = owner.team_id
          where owner.id = player_achievements.player_id and viewer.user_id = auth.uid()
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'player_cosmetics' and policyname = 'Players manage own cosmetics') then
    create policy "Players manage own cosmetics" on public.player_cosmetics
      for all using (player_id = public.current_player_id())
      with check (player_id = public.current_player_id());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'team_challenges' and policyname = 'Team views challenges') then
    create policy "Team views challenges" on public.team_challenges
      for select using (
        exists (
          select 1 from public.players viewer
          where viewer.team_id = team_challenges.team_id and viewer.user_id = auth.uid()
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'team_challenges' and policyname = 'Admins manage challenges') then
    create policy "Admins manage challenges" on public.team_challenges
      for all using (public.current_player_role() = 'admin')
      with check (public.current_player_role() = 'admin');
  end if;
end $$;
