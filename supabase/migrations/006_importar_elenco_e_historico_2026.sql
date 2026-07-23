-- IMPORTAÇÃO INICIAL — Galera da Pelada / temporada 2026
-- Execute este arquivo uma única vez no SQL Editor do Supabase.
-- Ele mantém somente os atletas da lista de estatísticas enviada e grava o
-- histórico já acumulado. As fotos existentes de atletas que já estavam no
-- banco são preservadas; os demais ficam com o avatar temporário do site.

-- Permite registrar os jogos disputados antes de o site começar a ser usado.
alter table public.player_season_adjustments
add column if not exists games integer not null default 0 check (games >= 0);

do $$
begin
  create temporary table gpfc_import_2026 (
    name_key text primary key,
    name_keys text[] not null,
    full_name text not null,
    nickname text not null,
    shirt_number smallint,
    position text not null,
    games integer not null,
    goals integer not null,
    assists integer not null,
    craque integer not null,
    xerife integer not null,
    paredao integer not null
  ) on commit drop;

  insert into gpfc_import_2026 (
    name_key, name_keys, full_name, nickname, shirt_number, position,
    games, goals, assists, craque, xerife, paredao
  ) values
    ('robo',      array['robo'],                    'Robô',      'Robô',     10, 'Versátil', 12, 32, 11, 1, 0, 0),
    ('ricardo',   array['ricardo'],                 'Ricardo',   'Ricardo',  30, 'Versátil', 14, 31, 14, 2, 0, 0),
    ('elly',      array['elly', 'elly alves'],      'Elly',      'Elly',      9, 'Versátil', 14, 17,  7, 0, 0, 0),
    ('schelton',  array['schelton', 'schelton f.'], 'Schelton',  'Schelton',  7, 'Versátil', 10, 15, 10, 0, 0, 0),
    ('victor b.', array['victor b.', 'vitor b.'],   'Victor B.', 'Victor',    1, 'Versátil', 13, 13,  6, 0, 1, 0),
    ('fabinho',   array['fabinho'],                 'Fabinho',   'Fabinho',   8, 'Versátil',  6,  8,  1, 1, 0, 0),
    ('tarciso',   array['tarciso'],                 'Tarciso',   'Tarciso',   7, 'Versátil',  9,  8,  3, 0, 0, 0),
    ('alerf',     array['alerf', 'alerffe'],        'Alerf',     'Alerf',    20, 'Versátil',  6,  7,  1, 1, 1, 0),
    ('fabio',     array['fabio'],                   'Fabio',     'Fabio',     6, 'Versátil', 13,  7,  3, 0, 4, 0),
    ('paqueta',   array['paqueta'],                 'Paqueta',   'Paqueta',  11, 'Versátil', 13,  7,  8, 1, 2, 0),
    ('lenilson',  array['lenilson'],                'Lenilson',  'Lenilson', 87, 'Versátil',  8,  6,  2, 1, 0, 0),
    ('pablo',     array['pablo', 'pablo di luca'],  'Pablo',     'Pablo',    19, 'Versátil', 10,  5,  1, 0, 0, 0),
    ('almir',     array['almir'],                   'Almir',     'Almir',    23, 'Versátil', 10,  4,  8, 1, 3, 0),
    ('dodo',      array['dodo'],                    'Dodo',      'Dodo',   null, 'Versátil',  5,  4,  2, 0, 0, 0),
    ('black',     array['black'],                   'Black',     'Black',  null, 'Versátil',  2,  4,  3, 0, 0, 0),
    ('anderson',  array['anderson'],                'Anderson',  'Anderson',33, 'Versátil', 13,  2,  1, 0, 3, 0),
    ('henrique',  array['henrique'],                'Henrique',  'Henrique',92, 'Versátil',  8,  2,  4, 0, 2, 0),
    ('plinio',    array['plinio'],                  'Plinio',    'Plinio',  27, 'Versátil',  9,  2,  1, 0, 1, 0),
    ('helton',    array['helton', 'heton'],         'Helton',    'Helton',   0, 'Versátil',  3,  1,  0, 0, 1, 0),
    ('matuto',    array['matuto'],                  'Matuto',    'Matuto',  24, 'Versátil',  1,  1,  0, 0, 0, 0),
    ('jo',        array['jo'],                      'Jô',        'Jô',     null, 'Versátil',  2,  1,  2, 0, 0, 0),
    ('leandro',   array['leandro', 'leandro c.'],   'Leandro',   'Leandro', 26, 'Versátil',  9,  0,  2, 0, 0, 0),
    ('wedson',    array['wedson'],                  'Wedson',    'Wedson',  12, 'Goleiro',  14,  0,  0, 1, 0, 7),
    ('vitor',     array['vitor'],                   'Vitor',     'Vitor',    1, 'Goleiro',   9,  0,  0, 1, 0, 4),
    ('rafa',      array['rafa'],                    'Rafa',      'Rafa',     1, 'Goleiro',  10,  0,  0, 0, 0, 2);

  -- Normaliza letras acentuadas antes de comparar nomes já existentes.
  update public.players as p
  set full_name = r.full_name,
      nickname = r.nickname,
      shirt_number = r.shirt_number,
      position = r.position
  from gpfc_import_2026 as r
  where regexp_replace(translate(lower(trim(p.full_name)),
      'áàâãäéèêëíìîïóòôõöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc'), '\\s+', ' ', 'g') = any(r.name_keys);

  insert into public.players (full_name, nickname, shirt_number, position)
  select r.full_name, r.nickname, r.shirt_number, r.position
  from gpfc_import_2026 as r
  where not exists (
    select 1
    from public.players as p
    where regexp_replace(translate(lower(trim(p.full_name)),
        'áàâãäéèêëíìîïóòôõöúùûüç',
        'aaaaaeeeeiiiiooooouuuuc'), '\\s+', ' ', 'g') = any(r.name_keys)
  );

  -- Remove do elenco nomes que não aparecem na sua lista de estatísticas.
  delete from public.players as p
  where not exists (
    select 1
    from gpfc_import_2026 as r
    where regexp_replace(translate(lower(trim(p.full_name)),
        'áàâãäéèêëíìîïóòôõöúùûüç',
        'aaaaaeeeeiiiiooooouuuuc'), '\\s+', ' ', 'g') = any(r.name_keys)
  );

  insert into public.player_season_adjustments (
    player_id, season, games, goals, assists, craque, xerife, paredao, updated_at
  )
  select p.id, 2026, r.games, r.goals, r.assists, r.craque, r.xerife, r.paredao, now()
  from public.players as p
  join gpfc_import_2026 as r
    on regexp_replace(translate(lower(trim(p.full_name)),
        'áàâãäéèêëíìîïóòôõöúùûüç',
        'aaaaaeeeeiiiiooooouuuuc'), '\\s+', ' ', 'g') = any(r.name_keys)
  on conflict (player_id, season) do update
  set games = excluded.games,
      goals = excluded.goals,
      assists = excluded.assists,
      craque = excluded.craque,
      xerife = excluded.xerife,
      paredao = excluded.paredao,
      updated_at = excluded.updated_at;
end $$;

-- Conferência: ao final devem aparecer 25 atletas com os números importados.
select p.full_name as atleta,
       p.shirt_number as camisa,
       p.position as posicao,
       a.games as jogos,
       a.goals as gols,
       a.assists as assistencias,
       a.craque,
       a.xerife,
       a.paredao
from public.players as p
left join public.player_season_adjustments as a
  on a.player_id = p.id and a.season = 2026
order by p.full_name;
