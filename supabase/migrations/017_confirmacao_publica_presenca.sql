-- Confirmação pública de presença usando somente atletas já cadastrados.
-- Execute uma única vez no SQL Editor do Supabase, depois da migração 016.

create or replace function public.confirm_round_attendance(
  p_round_id uuid,
  p_player_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('present', 'unknown', 'absent') then
    raise exception 'Status de presença inválido.';
  end if;

  if not exists (
    select 1
    from public.players
    where id = p_player_id
  ) then
    raise exception 'Atleta não encontrado.';
  end if;

  if not exists (
    select 1
    from public.rounds
    where id = p_round_id
      and status = 'draft'
      and coalesce(attendance_closed, false) = false
  ) then
    raise exception 'A confirmação desta rodada está fechada.';
  end if;

  insert into public.round_attendance (round_id, player_id, status, updated_at)
  values (p_round_id, p_player_id, p_status, now())
  on conflict (round_id, player_id)
  do update set
    status = excluded.status,
    updated_at = now();
end;
$$;

revoke all on function public.confirm_round_attendance(uuid, uuid, text) from public;
grant execute on function public.confirm_round_attendance(uuid, uuid, text) to anon, authenticated;
