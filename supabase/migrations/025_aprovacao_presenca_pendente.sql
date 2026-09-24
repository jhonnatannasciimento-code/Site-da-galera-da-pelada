-- Solicitacoes de presenca para mensalistas com pendencia.
-- Execute uma unica vez no SQL Editor do Supabase, depois da migracao 024.

create table if not exists public.attendance_approval_requests (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 300),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, player_id)
);

create index if not exists attendance_approval_requests_status_idx
on public.attendance_approval_requests (status, created_at desc);

alter table public.attendance_approval_requests enable row level security;

drop policy if exists "Admins read attendance requests" on public.attendance_approval_requests;
create policy "Admins read attendance requests"
on public.attendance_approval_requests for select
to authenticated
using (public.is_admin());

revoke all on public.attendance_approval_requests from anon;
revoke insert, update, delete on public.attendance_approval_requests from authenticated;
grant select on public.attendance_approval_requests to authenticated;

create or replace function public.request_round_attendance(
  p_round_id uuid,
  p_player_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  round_date date;
  current_status text;
  request_id uuid;
begin
  if p_status not in ('present', 'unknown', 'absent') then
    raise exception 'Status de presença inválido.';
  end if;

  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'Atleta não encontrado.';
  end if;

  select played_on into round_date
  from public.rounds
  where id = p_round_id
    and status = 'draft'
    and coalesce(attendance_closed, false) = false;

  if round_date is null then
    raise exception 'A confirmação desta rodada está fechada.';
  end if;

  select status into current_status
  from public.round_attendance
  where round_id = p_round_id
    and player_id = p_player_id;

  if p_status = 'present'
     and current_status is distinct from 'present'
     and not public.player_fee_is_regular(p_player_id, round_date) then
    insert into public.attendance_approval_requests (
      round_id, player_id, status, admin_note, reviewed_by, reviewed_at, notified_at, updated_at
    ) values (
      p_round_id, p_player_id, 'pending', null, null, null, null, now()
    )
    on conflict (round_id, player_id)
    do update set
      status = 'pending',
      admin_note = null,
      reviewed_by = null,
      reviewed_at = null,
      notified_at = case
        when attendance_approval_requests.status = 'pending' then attendance_approval_requests.notified_at
        else null
      end,
      updated_at = now()
    returning id into request_id;

    return jsonb_build_object('result', 'pending_approval', 'request_id', request_id);
  end if;

  insert into public.round_attendance (round_id, player_id, status, updated_at)
  values (p_round_id, p_player_id, p_status, now())
  on conflict (round_id, player_id)
  do update set status = excluded.status, updated_at = now();

  if p_status <> 'present' then
    update public.attendance_approval_requests
    set status = 'cancelled', updated_at = now()
    where round_id = p_round_id
      and player_id = p_player_id
      and status = 'pending';
  else
    update public.attendance_approval_requests
    set status = 'cancelled', updated_at = now()
    where round_id = p_round_id
      and player_id = p_player_id
      and status in ('pending', 'rejected');
  end if;

  return jsonb_build_object('result', 'confirmed', 'request_id', null);
end;
$$;

revoke all on function public.request_round_attendance(uuid, uuid, text) from public;
grant execute on function public.request_round_attendance(uuid, uuid, text) to anon, authenticated;

create or replace function public.get_attendance_request_status(
  p_round_id uuid,
  p_player_id uuid
)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select status
  from public.attendance_approval_requests
  where round_id = p_round_id
    and player_id = p_player_id;
$$;

revoke all on function public.get_attendance_request_status(uuid, uuid) from public;
grant execute on function public.get_attendance_request_status(uuid, uuid) to anon, authenticated;

create or replace function public.review_attendance_request(
  p_request_id uuid,
  p_decision text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request_row public.attendance_approval_requests%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Apenas administradores podem analisar solicitações.';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decisão inválida.';
  end if;

  select * into request_row
  from public.attendance_approval_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Solicitação não encontrada.';
  end if;

  if request_row.status <> 'pending' then
    raise exception 'Esta solicitação já foi analisada.';
  end if;

  if not exists (
    select 1
    from public.rounds
    where id = request_row.round_id
      and status = 'draft'
      and coalesce(attendance_closed, false) = false
  ) then
    raise exception 'A confirmação desta rodada está fechada.';
  end if;

  update public.attendance_approval_requests
  set status = p_decision,
      admin_note = nullif(trim(p_note), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id;

  if p_decision = 'approved' then
    insert into public.round_attendance (
      round_id, player_id, status, payment_override, payment_override_by, updated_at
    ) values (
      request_row.round_id, request_row.player_id, 'present', true, auth.uid(), now()
    )
    on conflict (round_id, player_id)
    do update set
      status = 'present',
      payment_override = true,
      payment_override_by = auth.uid(),
      updated_at = now();
  end if;
end;
$$;

revoke all on function public.review_attendance_request(uuid, text, text) from public;
grant execute on function public.review_attendance_request(uuid, text, text) to authenticated;

drop trigger if exists audit_admin_changes on public.attendance_approval_requests;
create trigger audit_admin_changes
after insert or update or delete on public.attendance_approval_requests
for each row execute function public.log_admin_activity();
