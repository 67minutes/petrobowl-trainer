-- Adds an is_player flag, orthogonal to role, controlling whether a person
-- appears as a competitor (buzz list, dashboard player table, team analytics).
-- role still controls admin powers. Pure hosts get is_player = false while
-- still keeping role = 'admin'; people who both host and compete (e.g. Maulidan)
-- keep is_player = true.
alter table public.players
  add column is_player boolean not null default true;
