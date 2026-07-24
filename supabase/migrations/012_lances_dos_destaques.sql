-- 012: links de Reels dos lances que marcaram os destaques de cada rodada.
-- Execute uma única vez no SQL Editor do Supabase, depois da migração 011.

create table if not exists public.round_highlight_clips (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  clip_type text not null check (clip_type in ('gol', 'assistencia', 'defesa', 'drible', 'outro')),
  instagram_url text not null check (instagram_url ~ '^https?://'),
  caption text not null default '' check (char_length(caption) <= 180),
  created_at timestamptz not null default now()
);

create index if not exists round_highlight_clips_round_id_idx
on public.round_highlight_clips (round_id, created_at desc);

alter table public.round_highlight_clips enable row level security;

drop policy if exists "Leitura pública dos lances" on public.round_highlight_clips;
create policy "Leitura pública dos lances"
on public.round_highlight_clips for select
to anon, authenticated
using (true);

drop policy if exists "Admin gerencia lances" on public.round_highlight_clips;
create policy "Admin gerencia lances"
on public.round_highlight_clips for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.round_highlight_clips to anon, authenticated;
grant insert, update, delete on public.round_highlight_clips to authenticated;
