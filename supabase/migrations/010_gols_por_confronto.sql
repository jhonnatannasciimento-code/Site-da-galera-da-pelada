-- 010: armazena cada gol do confronto para preservar autor e assistência.

create table if not exists public.game_goal_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  event_number integer not null check (event_number > 0),
  team_number integer not null check (team_number between 1 and 20),
  scorer_id uuid not null references public.players(id) on delete restrict,
  assister_id uuid references public.players(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (game_id, event_number)
);

alter table public.game_goal_events enable row level security;

drop policy if exists "Leitura pública dos gols" on public.game_goal_events;
create policy "Leitura pública dos gols"
on public.game_goal_events for select
to anon, authenticated
using (true);

drop policy if exists "Admin gerencia gols" on public.game_goal_events;
create policy "Admin gerencia gols"
on public.game_goal_events for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.game_goal_events to anon, authenticated;
grant insert, update, delete on public.game_goal_events to authenticated;
