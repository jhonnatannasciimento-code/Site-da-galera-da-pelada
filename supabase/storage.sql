-- Execute uma vez no SQL Editor do Supabase para liberar o envio seguro de fotos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'player-photos',
  'player-photos',
  true,
  2621440,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "Public can view player photos"
on storage.objects for select
using (bucket_id = 'player-photos');

create policy "Admin manages player photos"
on storage.objects for all to authenticated
using (bucket_id = 'player-photos' and public.is_admin())
with check (bucket_id = 'player-photos' and public.is_admin());
