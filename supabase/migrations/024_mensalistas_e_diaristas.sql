-- Distingue mensalistas e diaristas sem apagar o historico esportivo.
-- Execute uma unica vez no SQL Editor do Supabase, depois da migracao 023.

alter table public.players
  add column if not exists membership_type text not null default 'monthly'
  check (membership_type in ('monthly', 'daily'));

alter table public.round_attendance
  add column if not exists counts_for_season boolean not null default true;

create or replace function public.set_attendance_season_eligibility()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  select coalesce(player.membership_type, 'monthly') = 'monthly'
    into new.counts_for_season
  from public.players player
  where player.id = new.player_id;

  return new;
end;
$$;

drop trigger if exists set_attendance_season_eligibility on public.round_attendance;
create trigger set_attendance_season_eligibility
before insert on public.round_attendance
for each row execute function public.set_attendance_season_eligibility();

-- Ao trocar o tipo, atualiza somente rodadas ainda abertas. O passado permanece intacto.
create or replace function public.sync_draft_attendance_membership()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.membership_type is distinct from old.membership_type then
    update public.round_attendance attendance
    set counts_for_season = new.membership_type = 'monthly',
        updated_at = now()
    from public.rounds round_item
    where attendance.round_id = round_item.id
      and attendance.player_id = new.id
      and round_item.status = 'draft';
  end if;

  return new;
end;
$$;

drop trigger if exists sync_draft_attendance_membership on public.players;
create trigger sync_draft_attendance_membership
after update of membership_type on public.players
for each row execute function public.sync_draft_attendance_membership();

-- Diaristas confirmam presenca sem depender de mensalidade.
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
    exists (
      select 1
      from public.players
      where id = p_player_id
        and membership_type = 'daily'
    )
    or not public.monthly_fee_required(p_played_on)
    or exists (
      select 1
      from public.player_monthly_fees
      where player_id = p_player_id
        and reference_month = date_trunc('month', p_played_on)::date
        and status in ('paid', 'exempt')
    );
$$;

revoke all on function public.player_fee_is_regular(uuid, date) from public;

create or replace function public.public_player_regularization(p_season integer)
returns table (
  player_id uuid,
  regularization_status text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with next_round as (
    select played_on
    from public.rounds
    where season = p_season
      and status = 'draft'
    order by round_number desc
    limit 1
  )
  select
    player.id as player_id,
    case
      when player.membership_type = 'daily' then 'daily'
      when exists (
        select 1
        from public.player_monthly_fees fee
        cross join next_round round_item
        where fee.player_id = player.id
          and fee.reference_month = date_trunc('month', round_item.played_on)::date
          and fee.status in ('paid', 'exempt')
      ) then 'regular'
      else 'pending'
    end as regularization_status
  from public.players player
  where exists (select 1 from next_round);
$$;

revoke all on function public.public_player_regularization(integer) from public;
grant execute on function public.public_player_regularization(integer) to anon, authenticated;
