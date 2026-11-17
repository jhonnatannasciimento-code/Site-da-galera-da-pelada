-- Permite retirar atletas do elenco atual sem apagar estatisticas ou registros antigos.
-- Execute uma unica vez no SQL Editor do Supabase, depois da migracao 025.

alter table public.players
  add column if not exists is_active boolean not null default true;

create index if not exists players_active_name_idx
  on public.players (is_active, full_name);

comment on column public.players.is_active is
  'Atleta disponivel no elenco atual. Inativos permanecem para preservar o historico.';
