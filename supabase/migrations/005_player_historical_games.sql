-- Execute uma única vez no SQL Editor do Supabase.
-- Inclui os jogos que aconteceram antes do uso do site.
alter table public.player_season_adjustments
add column if not exists games integer not null default 0 check (games >= 0);
