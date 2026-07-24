-- RODÍZIO, DESEMPATE E DESTAQUES DA RODADA — Galera da Pelada / 2026
-- Execute uma única vez no SQL Editor do Supabase, depois das migrações 007 e 008.

alter table public.player_game_stats
drop constraint if exists player_game_stats_team_number_check;

alter table public.player_game_stats
add constraint player_game_stats_team_number_check
check (team_number is null or team_number between 1 and 20);

alter table public.games
add column if not exists game_number integer,
add column if not exists result_method text not null default 'regular'
  check (result_method in ('regular', 'penalties', 'ficha')),
add column if not exists winner_side text
  check (winner_side is null or winner_side in ('home', 'away'));

create unique index if not exists games_round_game_number_idx
on public.games (round_id, game_number)
where round_id is not null and game_number is not null;

create table if not exists public.round_awards (
  round_id uuid not null references public.rounds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  category text not null check (category in ('craque', 'xerife', 'paredao')),
  created_at timestamptz not null default now(),
  primary key (round_id, player_id, category)
);

alter table public.round_awards enable row level security;

drop policy if exists "Public can read round awards" on public.round_awards;
drop policy if exists "Admin manages round awards" on public.round_awards;

create policy "Public can read round awards"
on public.round_awards for select
to anon, authenticated
using (true);

create policy "Admin manages round awards"
on public.round_awards for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.round_awards to anon, authenticated;
grant insert, update, delete on public.round_awards to authenticated;
