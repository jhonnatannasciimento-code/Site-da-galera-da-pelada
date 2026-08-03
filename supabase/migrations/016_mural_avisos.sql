-- Mural de avisos da Galera da Pelada.
-- Execute uma única vez no SQL Editor do Supabase, depois da migração 015.

create table if not exists public.bulletin_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 2 and 90),
  message text not null check (char_length(trim(message)) between 2 and 500),
  category text not null default 'general' check (category in ('important', 'round', 'financial', 'general')),
  is_pinned boolean not null default false,
  status text not null default 'active' check (status in ('active', 'archived')),
  expires_on date,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bulletin_notices_public_idx
on public.bulletin_notices (status, is_pinned desc, published_at desc);

alter table public.bulletin_notices enable row level security;

drop policy if exists "Public can view active notices" on public.bulletin_notices;
create policy "Public can view active notices"
on public.bulletin_notices for select
to anon, authenticated
using (status = 'active' and (expires_on is null or expires_on >= current_date));

drop policy if exists "Admin manages bulletin notices" on public.bulletin_notices;
create policy "Admin manages bulletin notices"
on public.bulletin_notices for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.bulletin_notices to anon, authenticated;
grant insert, update, delete on public.bulletin_notices to authenticated;
