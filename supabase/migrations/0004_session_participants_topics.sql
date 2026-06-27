do $$
begin
  create type public.session_topic_mode as enum ('topics', 'player_assigned', 'player_assigned_plus');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.session_topic_source as enum ('manual', 'assigned', 'extra', 'legacy');
exception
  when duplicate_object then null;
end $$;

alter table public.sessions
  add column if not exists topic_mode public.session_topic_mode not null default 'player_assigned';

create table if not exists public.session_participants (
  session_id uuid not null references public.sessions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, player_id)
);

create table if not exists public.session_topics (
  session_id uuid not null references public.sessions(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  source public.session_topic_source not null,
  created_at timestamptz not null default now(),
  primary key (session_id, topic_id)
);

insert into public.session_participants (session_id, player_id)
select s.id, p.id
from public.sessions s
join public.players p on p.team_id = s.team_id
where p.is_player = true
on conflict do nothing;

insert into public.session_topics (session_id, topic_id, source)
select distinct sq.session_id, q.topic_id, 'legacy'::public.session_topic_source
from public.session_questions sq
join public.questions q on q.id = sq.question_id
on conflict do nothing;

alter table public.session_participants enable row level security;
alter table public.session_topics enable row level security;

create policy "Players view session participants" on public.session_participants
  for select using (
    exists (
      select 1
      from public.sessions s
      join public.players viewer on viewer.team_id = s.team_id
      where s.id = session_participants.session_id and viewer.user_id = auth.uid()
    )
  );

create policy "Admins manage session participants" on public.session_participants
  for all using (public.current_player_role() = 'admin')
  with check (public.current_player_role() = 'admin');

create policy "Players view session topics" on public.session_topics
  for select using (
    exists (
      select 1
      from public.sessions s
      join public.players viewer on viewer.team_id = s.team_id
      where s.id = session_topics.session_id and viewer.user_id = auth.uid()
    )
  );

create policy "Admins manage session topics" on public.session_topics
  for all using (public.current_player_role() = 'admin')
  with check (public.current_player_role() = 'admin');

create or replace view public.session_scores as
with player_sessions as (
  select sp.session_id, sp.player_id
  from public.session_participants sp
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
    count(sq.*) filter (where sq.assigned_to = ps.player_id and (sq.buzzed_by is distinct from ps.player_id or not sq.correct)) as missed_topic,
    count(sq.*) filter (where sq.missed_by[1] = ps.player_id and sq.assigned_to is distinct from ps.player_id) as wrong_buzzes
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
  case when others_qs = 0 then 0 else ((2 * out_of_topic - wrong_buzzes)::double precision / others_qs) * 100 end as offense_bonus,
  0.7 * (case when own_qs = 0 then 0 else ((on_topic - 0.5 * missed_topic)::double precision / own_qs) * 100 end)
    + 0.3 * (case when others_qs = 0 then 0 else ((2 * out_of_topic - wrong_buzzes)::double precision / others_qs) * 100 end) as total_score,
  wrong_buzzes
from question_counts;
