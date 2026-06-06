create extension if not exists pgcrypto;

create type public.player_role as enum ('admin', 'player');
create type public.session_status as enum ('draft', 'active', 'completed');

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  role public.player_role not null default 'player',
  created_at timestamptz not null default now(),
  unique (team_id, name),
  unique (user_id)
);

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  source text,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (team_id, name)
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  question text not null,
  answer text not null,
  metadata jsonb not null default '{}'::jsonb,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (topic_id, question, answer)
);

create table public.topic_assignments (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz
);

create unique index topic_assignments_one_active
  on public.topic_assignments(topic_id)
  where unassigned_at is null;

create table public.card_progress (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  ease_factor double precision not null default 2.5 check (ease_factor >= 1.3),
  interval_days int not null default 0 check (interval_days >= 0),
  repetitions int not null default 0 check (repetitions >= 0),
  next_review date not null default current_date,
  last_reviewed timestamptz,
  unique (player_id, question_id)
);

create table public.drill_responses (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  correct boolean not null,
  rating text not null check (rating in ('again', 'hard', 'good', 'easy')),
  response_time_ms int not null check (response_time_ms >= 0),
  reviewed_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  created_by uuid not null references public.players(id) on delete restrict,
  num_questions int not null check (num_questions > 0),
  status public.session_status not null default 'draft',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.session_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  question_order int not null check (question_order > 0),
  assigned_to uuid references public.players(id) on delete set null,
  buzzed_by uuid references public.players(id) on delete set null,
  correct boolean not null default true,
  unique (session_id, question_order)
);

create or replace view public.session_scores as
with player_sessions as (
  select s.id as session_id, p.id as player_id
  from public.sessions s
  join public.players p on p.team_id = s.team_id
),
question_counts as (
  select
    ps.session_id,
    ps.player_id,
    count(sq.*) filter (where sq.assigned_to = ps.player_id) as own_qs,
    count(sq.*) filter (where sq.assigned_to is distinct from ps.player_id) as others_qs,
    count(sq.*) filter (where sq.buzzed_by = ps.player_id and sq.correct) as correct_answers,
    count(sq.*) filter (where sq.assigned_to = ps.player_id and sq.buzzed_by = ps.player_id and sq.correct) as on_topic,
    count(sq.*) filter (where sq.assigned_to is distinct from ps.player_id and sq.buzzed_by = ps.player_id and sq.correct) as out_of_topic,
    count(sq.*) filter (where sq.assigned_to = ps.player_id and (sq.buzzed_by is distinct from ps.player_id or not sq.correct)) as missed_topic
  from player_sessions ps
  left join public.session_questions sq on sq.session_id = ps.session_id
  group by ps.session_id, ps.player_id
)
select
  session_id,
  player_id,
  correct_answers,
  on_topic,
  out_of_topic,
  missed_topic,
  case when own_qs = 0 then 0 else ((on_topic - 0.5 * missed_topic)::double precision / own_qs) * 100 end as defense_score,
  case when others_qs = 0 then 0 else ((2 * out_of_topic)::double precision / others_qs) * 100 end as offense_bonus,
  0.7 * (case when own_qs = 0 then 0 else ((on_topic - 0.5 * missed_topic)::double precision / own_qs) * 100 end)
    + 0.3 * (case when others_qs = 0 then 0 else ((2 * out_of_topic)::double precision / others_qs) * 100 end) as total_score
from question_counts;

alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.topics enable row level security;
alter table public.questions enable row level security;
alter table public.topic_assignments enable row level security;
alter table public.card_progress enable row level security;
alter table public.drill_responses enable row level security;
alter table public.sessions enable row level security;
alter table public.session_questions enable row level security;

create or replace function public.current_player_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.players where user_id = auth.uid() limit 1
$$;

create or replace function public.current_player_role()
returns public.player_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.players where user_id = auth.uid() limit 1
$$;

create policy "Players can view their team" on public.teams
  for select using (
    exists (
      select 1 from public.players
      where players.team_id = teams.id and players.user_id = auth.uid()
    )
  );

create policy "Players can view team players" on public.players
  for select using (
    exists (
      select 1 from public.players viewer
      where viewer.team_id = players.team_id and viewer.user_id = auth.uid()
    )
  );

create policy "Admins manage team players" on public.players
  for all using (public.current_player_role() = 'admin')
  with check (public.current_player_role() = 'admin');

create policy "Players view team topics" on public.topics
  for select using (
    exists (
      select 1 from public.players viewer
      where viewer.team_id = topics.team_id and viewer.user_id = auth.uid()
    )
  );

create policy "Admins manage topics" on public.topics
  for all using (public.current_player_role() = 'admin')
  with check (public.current_player_role() = 'admin');

create policy "Players view team questions" on public.questions
  for select using (
    exists (
      select 1
      from public.topics t
      join public.players viewer on viewer.team_id = t.team_id
      where t.id = questions.topic_id and viewer.user_id = auth.uid()
    )
  );

create policy "Admins manage questions" on public.questions
  for all using (public.current_player_role() = 'admin')
  with check (public.current_player_role() = 'admin');

create policy "Players view assignments" on public.topic_assignments
  for select using (
    exists (
      select 1
      from public.topics t
      join public.players viewer on viewer.team_id = t.team_id
      where t.id = topic_assignments.topic_id and viewer.user_id = auth.uid()
    )
  );

create policy "Admins manage assignments" on public.topic_assignments
  for all using (public.current_player_role() = 'admin')
  with check (public.current_player_role() = 'admin');

create policy "Players manage own progress" on public.card_progress
  for all using (player_id = public.current_player_id())
  with check (player_id = public.current_player_id());

create policy "Admins view all progress" on public.card_progress
  for select using (public.current_player_role() = 'admin');

create policy "Players insert own responses" on public.drill_responses
  for insert with check (player_id = public.current_player_id());

create policy "Players view own responses" on public.drill_responses
  for select using (player_id = public.current_player_id() or public.current_player_role() = 'admin');

create policy "Players view team sessions" on public.sessions
  for select using (
    exists (
      select 1 from public.players viewer
      where viewer.team_id = sessions.team_id and viewer.user_id = auth.uid()
    )
  );

create policy "Admins manage sessions" on public.sessions
  for all using (public.current_player_role() = 'admin')
  with check (public.current_player_role() = 'admin');

create policy "Players view session questions" on public.session_questions
  for select using (
    exists (
      select 1
      from public.sessions s
      join public.players viewer on viewer.team_id = s.team_id
      where s.id = session_questions.session_id and viewer.user_id = auth.uid()
    )
  );

create policy "Admins manage session questions" on public.session_questions
  for all using (public.current_player_role() = 'admin')
  with check (public.current_player_role() = 'admin');
