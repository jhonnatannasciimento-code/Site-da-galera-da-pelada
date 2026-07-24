-- Diretoria do G.P.F.C: leitura pública e edição restrita ao administrador.
create table if not exists public.director_profiles (
  id uuid primary key default gen_random_uuid(),
  slot smallint not null unique check (slot between 1 and 3),
  full_name text not null check (char_length(full_name) between 2 and 80),
  role text not null check (char_length(role) between 2 and 100),
  instagram_url text not null check (instagram_url ~ '^https?://'),
  photo_url text,
  updated_at timestamptz not null default now()
);

alter table public.director_profiles enable row level security;

drop policy if exists "Public can view director profiles" on public.director_profiles;
create policy "Public can view director profiles"
on public.director_profiles for select
using (true);

drop policy if exists "Admin manages director profiles" on public.director_profiles;
create policy "Admin manages director profiles"
on public.director_profiles for all to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.director_profiles to anon, authenticated;
grant insert, update, delete on public.director_profiles to authenticated;

insert into public.director_profiles (slot, full_name, role, instagram_url)
values
  (1, 'Anderson', 'Diretor Geral', 'https://www.instagram.com/anderson_r_andrade/'),
  (2, 'Almir', 'Diretor Auxiliar', 'https://www.instagram.com/almir.claudino/'),
  (3, 'Jhonnatan', 'Diretor de Marketing', 'https://www.instagram.com/jhonnatan_nascimento/')
on conflict (slot) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'director-photos',
  'director-photos',
  true,
  2621440,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "Public can view director photos" on storage.objects;
create policy "Public can view director photos"
on storage.objects for select
using (bucket_id = 'director-photos');

drop policy if exists "Admin manages director photos" on storage.objects;
create policy "Admin manages director photos"
on storage.objects for all to authenticated
using (bucket_id = 'director-photos' and public.is_admin())
with check (bucket_id = 'director-photos' and public.is_admin());
