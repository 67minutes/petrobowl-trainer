-- Bonus questions: unowned "study" questions (e.g. the public-domain energy
-- glossaries) mixed into a buzzer session. They score purely additively — +5 for
-- each correct answer, no owner, no steal, no penalty — and are excluded from the
-- defense/offense ratio model. Mirrors src/lib/scoring.ts (keep the two in sync).

-- 1. Flag bonus session questions.
alter table public.session_questions
  add column if not exists is_bonus boolean not null default false;

-- 2. Scoring view: exclude bonus rows from the ratio model, add a flat bonus term.
-- Dropped and recreated (not CREATE OR REPLACE) because the new bonus_correct /
-- bonus_score columns change the column order, which REPLACE forbids.
drop view if exists public.session_scores;

create view public.session_scores as
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
    sq.is_bonus,
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
    count(e.*) filter (where not e.is_bonus and ps.player_id = any(e.owners)) as own_qs,
    count(e.*) filter (where not e.is_bonus and not (ps.player_id = any(e.owners))) as others_qs,
    -- Every correct buzz, bonus included (raw tally for display).
    count(e.*) filter (where e.buzzed_by = ps.player_id and e.correct) as correct_answers,
    count(e.*) filter (
      where not e.is_bonus and ps.player_id = any(e.owners) and e.buzzed_by = ps.player_id and e.correct
    ) as on_topic,
    count(e.*) filter (
      where not e.is_bonus and not (ps.player_id = any(e.owners)) and e.buzzed_by = ps.player_id and e.correct
    ) as out_of_topic,
    -- Weighted missed-topic penalty per the design rule (owned, non-bonus only).
    coalesce(sum(
      case
        when not e.is_bonus and ps.player_id = any(e.owners) and not (e.buzzed_by = ps.player_id and e.correct) then
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
      where not e.is_bonus and ps.player_id = any(e.owners) and not (e.buzzed_by = ps.player_id and e.correct)
    ) as missed_topic,
    count(e.*) filter (
      where not e.is_bonus and e.missed_by[1] = ps.player_id and not (ps.player_id = any(e.owners))
    ) as wrong_buzzes,
    -- Bonus questions: correct answers only, no penalty for misses.
    count(e.*) filter (where e.is_bonus and e.buzzed_by = ps.player_id and e.correct) as bonus_correct
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
  bonus_correct,
  (bonus_correct * 5)::double precision as bonus_score,
  case when own_qs = 0 then 0 else ((on_topic - 0.5 * missed_weight)::double precision / own_qs) * 100 end as defense_score,
  case when others_qs = 0 then 0 else ((2 * out_of_topic - wrong_buzzes)::double precision / others_qs) * 100 end as offense_bonus,
  0.7 * (case when own_qs = 0 then 0 else ((on_topic - 0.5 * missed_weight)::double precision / own_qs) * 100 end)
    + 0.3 * (case when others_qs = 0 then 0 else ((2 * out_of_topic - wrong_buzzes)::double precision / others_qs) * 100 end)
    + (bonus_correct * 5) as total_score,
  wrong_buzzes
from question_scores;
