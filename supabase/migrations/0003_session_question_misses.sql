alter table public.session_questions
  add column missed_by uuid[] not null default '{}'::uuid[];

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
  wrong_buzzes,
  case when own_qs = 0 then 0 else ((on_topic - 0.5 * missed_topic)::double precision / own_qs) * 100 end as defense_score,
  case when others_qs = 0 then 0 else ((2 * out_of_topic - wrong_buzzes)::double precision / others_qs) * 100 end as offense_bonus,
  0.7 * (case when own_qs = 0 then 0 else ((on_topic - 0.5 * missed_topic)::double precision / own_qs) * 100 end)
    + 0.3 * (case when others_qs = 0 then 0 else ((2 * out_of_topic - wrong_buzzes)::double precision / others_qs) * 100 end) as total_score
from question_counts;
