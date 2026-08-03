-- 018: galeria pública de fotos e vídeos da história do G.P.F.C.
-- Execute uma única vez no SQL Editor do Supabase, depois da migração 017.

create table if not exists public.media_items (
  id uuid primary key default gen_random_uuid(),
  media_type text not null check (media_type in ('photo', 'video')),
  title text not null check (char_length(trim(title)) between 2 and 100),
  description text not null default '' check (char_length(description) <= 600),
  media_year integer not null check (media_year between 2016 and 2100),
  category text not null default 'outro' check (category in ('rodada', 'premiacao', 'confraternizacao', 'historia', 'outro')),
  round_id uuid references public.rounds(id) on delete set null,
  source_url text not null check (source_url ~ '^https://'),
  is_featured boolean not null default false,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.media_item_players (
  media_id uuid not null references public.media_items(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  primary key (media_id, player_id)
);

create index if not exists media_items_public_idx
on public.media_items (status, is_featured desc, media_year desc, created_at desc);

create index if not exists media_item_players_player_idx
on public.media_item_players (player_id, media_id);

alter table public.media_items enable row level security;
alter table public.media_item_players enable row level security;

drop policy if exists "Leitura pública das mídias" on public.media_items;
create policy "Leitura pública das mídias"
on public.media_items for select
to anon, authenticated
using (status = 'active' or public.is_admin());

drop policy if exists "Admin gerencia mídias" on public.media_items;
create policy "Admin gerencia mídias"
on public.media_items for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Leitura pública dos atletas das mídias" on public.media_item_players;
create policy "Leitura pública dos atletas das mídias"
on public.media_item_players for select
to anon, authenticated
using (true);

drop policy if exists "Admin gerencia atletas das mídias" on public.media_item_players;
create policy "Admin gerencia atletas das mídias"
on public.media_item_players for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.media_items, public.media_item_players to anon, authenticated;
grant insert, update, delete on public.media_items, public.media_item_players to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media-gallery',
  'media-gallery',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view gallery media" on storage.objects;
create policy "Public can view gallery media"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'media-gallery');

drop policy if exists "Admin manages gallery media" on storage.objects;
create policy "Admin manages gallery media"
on storage.objects for all
to authenticated
using (bucket_id = 'media-gallery' and public.is_admin())
with check (bucket_id = 'media-gallery' and public.is_admin());

