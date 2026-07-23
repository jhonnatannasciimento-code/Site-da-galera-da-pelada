-- PRESENÇA DA RODADA E TIMES NUMERADOS — Galera da Pelada / temporada 2026
-- Execute uma única vez no SQL Editor do Supabase, depois da migração 007.

alter table public.player_game_stats
add column if not exists team_number smallint
check (team_number is null or team_number between 1 and 10);

create index if not exists player_game_stats_game_team_number_idx
on public.player_game_stats (game_id, team_number);

create table if not exists public.round_attendance (
  round_id uuid not null references public.rounds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  status text not null default 'unknown'
    check (status in ('present', 'absent', 'unknown')),
  updated_at timestamptz not null default now(),
  primary key (round_id, player_id)
);

alter table public.round_attendance enable row level security;

drop policy if exists "Public can read round attendance" on public.round_attendance;
drop policy if exists "Admin manages round attendance" on public.round_attendance;

create policy "Public can read round attendance"
on public.round_attendance for select
to anon, authenticated
using (true);

create policy "Admin manages round attendance"
on public.round_attendance for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.round_attendance to anon, authenticated;
grant insert, update, delete on public.round_attendance to authenticated;
