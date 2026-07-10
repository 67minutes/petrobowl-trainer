-- Synonym collapse: a single question can accept multiple answer terms.
-- Synonymous glossary terms (e.g. "drilling fluid" / "drilling mud") are merged
-- into one question row at seed time; accepted_answers lists every acceptable term
-- (including the primary answer). See
-- docs/superpowers/specs or the plan for the collapse algorithm.

alter table public.questions
  add column if not exists accepted_answers text[] not null default '{}';
