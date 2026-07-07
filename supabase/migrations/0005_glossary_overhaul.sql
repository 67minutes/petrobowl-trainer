-- Glossary question bank overhaul: retired topics, multi-owner topics,
-- term_key multi-home link, session_questions.owners, and a rewritten
-- weighted scoring view. See docs/superpowers/specs/2026-07-07-glossary-question-bank-overhaul-design.md

-- 1. Topics can be retired; name uniqueness applies only among active topics.
alter table public.topics add column if not exists retired_at timestamptz;
alter table public.topics drop constraint if exists topics_team_id_name_key;
create unique index if not exists topics_team_active_name
  on public.topics(team_id, name)
  where retired_at is null;

-- 2. Topics can have multiple active owners.
drop index if exists public.topic_assignments_one_active;
create unique index if not exists topic_assignments_active_owner
  on public.topic_assignments(topic_id, player_id)
  where unassigned_at is null;

-- 3. Multi-home link key for regrouping duplicate terms at buzzer time.
alter table public.questions add column if not exists term_key text;
create index if not exists questions_topic_term_key on public.questions(topic_id, term_key);
create index if not exists questions_term_key on public.questions(term_key);

-- 4. Session questions carry a set of owners.
alter table public.session_questions
  add column if not exists owners uuid[] not null default '{}'::uuid[];

-- 5. Scoring view: owner arrays + weighted penalty + back-compat fallback.
create or replace view public.session_scores as
with player_sessions as (
  select sp.session_id, sp.player_id
  from public.session_participants sp
),
effective as (
  select
    sq.session_id,
    sq.buzzed_by,
    sq.correct,
    sq.missed_by,
    case
      when array_length(sq.owners, 1) is not null and array_length(sq.owners, 1) > 0 then sq.owners
      when sq.assigned_to is not null then array[sq.assigned_to]
      else '{}'::uuid[]
    end as owners
  from public.session_questions sq
),
question_scores as (
  select
    ps.session_id,
    ps.player_id,
    count(e.*) filter (where ps.player_id = any(e.owners)) as own_qs,
    count(e.*) filter (where not (ps.player_id = any(e.owners))) as others_qs,
    count(e.*) filter (where e.buzzed_by = ps.player_id and e.correct) as correct_answers,
    count(e.*) filter (
      where ps.player_id = any(e.owners) and e.buzzed_by = ps.player_id and e.correct
    ) as on_topic,
    count(e.*) filter (
      where not (ps.player_id = any(e.owners)) and e.buzzed_by = ps.player_id and e.correct
    ) as out_of_topic,
    -- Weighted missed-topic penalty per the design rule.
    coalesce(sum(
      case
        when ps.player_id = any(e.owners) and not (e.buzzed_by = ps.player_id and e.correct) then
          case
            when e.buzzed_by = ps.player_id and not e.correct then 1.0                       -- buzzed own, wrong
            when e.correct and e.buzzed_by = any(e.owners) then 1.0                           -- co-owner took it
            else 1.0 / greatest(array_length(e.owners, 1), 1)                                 -- stolen or no-answer
          end
        else 0.0
      end
    ), 0.0) as missed_weight,
    -- Integer missed_topic kept for display/back-compat (any non-win on an owned q).
    count(e.*) filter (
      where ps.player_id = any(e.owners) and not (e.buzzed_by = ps.player_id and e.correct)
    ) as missed_topic,
    count(e.*) filter (
      where e.missed_by[1] = ps.player_id and not (ps.player_id = any(e.owners))
    ) as wrong_buzzes
  from player_sessions ps
  left join effective e on e.session_id = ps.session_id
  group by ps.session_id, ps.player_id
)
select
  session_id,
  player_id,
  correct_answers,
  on_topic,
  out_of_topic,
  missed_topic,
  case when own_qs = 0 then 0 else ((on_topic - 0.5 * missed_weight)::double precision / own_qs) * 100 end as defense_score,
  case when others_qs = 0 then 0 else ((2 * out_of_topic - wrong_buzzes)::double precision / others_qs) * 100 end as offense_bonus,
  0.7 * (case when own_qs = 0 then 0 else ((on_topic - 0.5 * missed_weight)::double precision / own_qs) * 100 end)
    + 0.3 * (case when others_qs = 0 then 0 else ((2 * out_of_topic - wrong_buzzes)::double precision / others_qs) * 100 end) as total_score,
  wrong_buzzes
from question_scores;
