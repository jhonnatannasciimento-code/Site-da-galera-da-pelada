-- Mensalidades e bloqueio seguro da confirmação pública de presença.
-- Execute uma única vez no SQL Editor do Supabase, depois da migração 020.

create table if not exists public.player_monthly_fees (
  player_id uuid not null references public.players(id) on delete cascade,
  reference_month date not null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'exempt')),
  paid_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 300),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (player_id, reference_month),
  check (reference_month = date_trunc('month', reference_month)::date)
);

create index if not exists player_monthly_fees_month_status_idx
on public.player_monthly_fees (reference_month, status);

alter table public.player_monthly_fees enable row level security;

drop policy if exists "Admins manage monthly fees" on public.player_monthly_fees;
create policy "Admins manage monthly fees"
on public.player_monthly_fees for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on public.player_monthly_fees from anon;
grant select, insert, update, delete on public.player_monthly_fees to authenticated;

alter table public.round_attendance
  add column if not exists payment_override boolean not null default false,
  add column if not exists payment_override_by uuid references auth.users(id) on delete set null;

create or replace function public.monthly_fee_required(p_played_on date)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_played_on >= (
    date_trunc('month', p_played_on)::date
    + (
      (
        6 - extract(dow from date_trunc('month', p_played_on)::date)::integer + 7
      ) % 7
    )
    + 7
  );
$$;

create or replace function public.player_fee_is_regular(
  p_player_id uuid,
  p_played_on date
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    not public.monthly_fee_required(p_played_on)
    or exists (
      select 1
      from public.player_monthly_fees
      where player_id = p_player_id
        and reference_month = date_trunc('month', p_played_on)::date
        and status in ('paid', 'exempt')
    );
$$;

revoke all on function public.player_fee_is_regular(uuid, date) from public;

create or replace function public.protect_paid_attendance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  round_date date;
  regular boolean;
  actor_id uuid := auth.uid();
begin
  select played_on into round_date
  from public.rounds
  where id = new.round_id;

  if new.status <> 'present' or round_date is null then
    new.payment_override := false;
    new.payment_override_by := null;
    return new;
  end if;

  regular := public.player_fee_is_regular(new.player_id, round_date);

  if regular then
    new.payment_override := false;
    new.payment_override_by := null;
    return new;
  end if;

  if actor_id is not null and public.is_admin() then
    new.payment_override := true;
    new.payment_override_by := actor_id;
    return new;
  end if;

  raise exception 'Presença não confirmada. Regularize sua mensalidade com a organização.';
end;
$$;

drop trigger if exists protect_paid_attendance on public.round_attendance;
create trigger protect_paid_attendance
before insert or update on public.round_attendance
for each row execute function public.protect_paid_attendance();

create or replace function public.confirm_round_attendance(
  p_round_id uuid,
  p_player_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  round_date date;
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

  if p_status = 'present'
     and not public.player_fee_is_regular(p_player_id, round_date) then
    raise exception 'Presença não confirmada. Regularize sua mensalidade com a organização.';
  end if;

  insert into public.round_attendance (
    round_id,
    player_id,
    status,
    payment_override,
    payment_override_by,
    updated_at
  ) values (
    p_round_id,
    p_player_id,
    p_status,
    false,
    null,
    now()
  )
  on conflict (round_id, player_id)
  do update set
    status = excluded.status,
    payment_override = false,
    payment_override_by = null,
    updated_at = now();
end;
$$;

revoke all on function public.confirm_round_attendance(uuid, uuid, text) from public;
grant execute on function public.confirm_round_attendance(uuid, uuid, text) to anon, authenticated;

-- Inclui as alterações financeiras no histórico dos administradores.
drop trigger if exists audit_admin_changes on public.player_monthly_fees;
create trigger audit_admin_changes
after insert or update or delete on public.player_monthly_fees
for each row execute function public.log_admin_activity();
