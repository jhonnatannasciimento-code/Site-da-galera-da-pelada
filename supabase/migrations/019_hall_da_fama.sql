-- 019: Hall da Fama anual do G.P.F.C.
-- Execute uma única vez no SQL Editor do Supabase, depois da migração 018.

create table if not exists public.hall_of_fame_awards (
  id uuid primary key default gen_random_uuid(),
  award_year integer not null check (award_year between 2016 and 2100),
  category text not null check (category in ('artilheiro', 'garcom', 'craque', 'xerife', 'paredao')),
  winner_name text not null check (char_length(trim(winner_name)) between 2 and 80),
  player_id uuid references public.players(id) on delete set null,
  photo_url text,
  note text not null default '' check (char_length(note) <= 300),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (award_year, category, winner_name)
);

create index if not exists hall_of_fame_public_idx
on public.hall_of_fame_awards (status, award_year desc, category, winner_name);

create index if not exists hall_of_fame_player_idx
on public.hall_of_fame_awards (player_id, award_year desc);

alter table public.hall_of_fame_awards enable row level security;

drop policy if exists "Leitura pública do Hall da Fama" on public.hall_of_fame_awards;
create policy "Leitura pública do Hall da Fama"
on public.hall_of_fame_awards for select
to anon, authenticated
using (status = 'active' or public.is_admin());

drop policy if exists "Admin gerencia Hall da Fama" on public.hall_of_fame_awards;
create policy "Admin gerencia Hall da Fama"
on public.hall_of_fame_awards for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.hall_of_fame_awards to anon, authenticated;
grant insert, update, delete on public.hall_of_fame_awards to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hall-of-fame',
  'hall-of-fame',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view Hall of Fame photos" on storage.objects;
create policy "Public can view Hall of Fame photos"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'hall-of-fame');

drop policy if exists "Admin manages Hall of Fame photos" on storage.objects;
create policy "Admin manages Hall of Fame photos"
on storage.objects for all
to authenticated
using (bucket_id = 'hall-of-fame' and public.is_admin())
with check (bucket_id = 'hall-of-fame' and public.is_admin());
