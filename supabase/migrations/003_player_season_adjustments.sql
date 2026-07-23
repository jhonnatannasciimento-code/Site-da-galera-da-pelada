-- Execute uma única vez no SQL Editor do Supabase.
-- Guarda o saldo já existente na temporada sem misturá-lo às rodadas semanais.
create table if not exists public.player_season_adjustments (
  player_id uuid not null references public.players(id) on delete cascade,
  season smallint not null default 2026 check (season between 2016 and 2100),
  goals integer not null default 0 check (goals >= 0),
  assists integer not null default 0 check (assists >= 0),
  craque integer not null default 0 check (craque >= 0),
  xerife integer not null default 0 check (xerife >= 0),
  paredao integer not null default 0 check (paredao >= 0),
  updated_at timestamptz not null default now(),
  primary key (player_id, season)
);

alter table public.player_season_adjustments enable row level security;

create policy "Public can read season adjustments"
on public.player_season_adjustments for select
to anon, authenticated
using (true);

create policy "Admin manages season adjustments"
on public.player_season_adjustments for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.player_season_adjustments to anon, authenticated;
grant insert, update, delete on public.player_season_adjustments to authenticated;
