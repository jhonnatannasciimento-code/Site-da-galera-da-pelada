-- Execute uma única vez no SQL Editor do Supabase.
-- Salva em qual lado cada atleta jogou no confronto: Time 1 (home) ou Time 2 (away).
alter table public.player_game_stats
add column if not exists team_side text
check (team_side is null or team_side in ('home', 'away'));

create index if not exists player_game_stats_game_team_side_idx
on public.player_game_stats (game_id, team_side);
