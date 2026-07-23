-- Execute uma única vez no SQL Editor do Supabase.
-- O número da camisa passa a ser um dado próprio, separado do nome do atleta.
alter table public.players
add column if not exists shirt_number smallint check (shirt_number between 0 and 99);

-- Aproveita números que já foram salvos no antigo campo de apelido.
update public.players
set shirt_number = nickname::smallint
where shirt_number is null
  and nickname ~ '^\d{1,2}$';
