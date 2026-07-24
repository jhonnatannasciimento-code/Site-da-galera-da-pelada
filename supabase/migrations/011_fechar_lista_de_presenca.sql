-- FECHAMENTO DA LISTA DE PRESENÇA — Galera da Pelada / temporada 2026
-- Execute uma única vez no SQL Editor do Supabase, depois da migração 010.

alter table public.rounds
add column if not exists attendance_closed boolean not null default false;
