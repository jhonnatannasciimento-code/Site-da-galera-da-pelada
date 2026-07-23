-- RODADAS E CONFRONTOS — Galera da Pelada / temporada 2026
-- Execute uma única vez no SQL Editor do Supabase antes de usar a Rodada 15.

create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  season smallint not null default 2026 check (season between 2016 and 2100),
  round_number integer not null check (round_number > 0),
  played_on date not null,
  place text,
  status text not null default 'draft' check (status in ('draft', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season, round_number)
);

alter table public.rounds enable row level security;

drop policy if exists "Public can read rounds" on public.rounds;
drop policy if exists "Admin manages rounds" on public.rounds;

create policy "Public can read rounds"
on public.rounds for select
to anon, authenticated
using (true);

create policy "Admin manages rounds"
on public.rounds for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.rounds to anon, authenticated;
grant insert, update, delete on public.rounds to authenticated;

alter table public.games
add column if not exists round_id uuid references public.rounds(id) on delete set null;

create index if not exists games_round_id_idx on public.games (round_id);
