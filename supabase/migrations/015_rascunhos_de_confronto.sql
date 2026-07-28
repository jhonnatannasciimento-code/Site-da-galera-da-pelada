-- 015: permite criar confrontos em rascunho antes de registrar o placar final.

alter table public.games
  add column if not exists status text not null default 'completed'
  check (status in ('draft', 'completed'));
