-- Situação pública e limitada do elenco para a próxima rodada.
-- Não expõe valores, observações, datas de pagamento ou distinção entre pago e isento.

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
      when exists (
        select 1
        from public.player_monthly_fees fee
        cross join next_round round
        where fee.player_id = player.id
          and fee.reference_month = date_trunc('month', round.played_on)::date
          and fee.status in ('paid', 'exempt')
      ) then 'regular'
      else 'pending'
    end as regularization_status
  from public.players player
  where exists (select 1 from next_round);
$$;

revoke all on function public.public_player_regularization(integer) from public;
grant execute on function public.public_player_regularization(integer) to anon, authenticated;
