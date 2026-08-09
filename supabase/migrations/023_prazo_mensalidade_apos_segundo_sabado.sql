-- A mensalidade passa a ser exigida somente depois do segundo sábado do mês.
-- No próprio segundo sábado, atletas pendentes ainda podem confirmar presença.
-- Execute uma única vez no SQL Editor do Supabase, depois da migração 022.

create or replace function public.monthly_fee_required(p_played_on date)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_played_on > (
    date_trunc('month', p_played_on)::date
    + (
      (
        6 - extract(dow from date_trunc('month', p_played_on)::date)::integer + 7
      ) % 7
    )
    + 7
  );
$$;
