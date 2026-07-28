-- 014: permite registrar gol contra sem somá-lo à artilharia do atleta.

alter table public.game_goal_events
  add column if not exists is_own_goal boolean not null default false;
