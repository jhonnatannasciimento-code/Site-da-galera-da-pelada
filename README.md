# Galera da Pelada

Site oficial da Galera da Pelada, com estatísticas da temporada, atletas, rodadas, confrontos e rankings.

Desde 2016, futebol é amizade, respeito e diversão.

## Objetivo do projeto

Organizar as informações da pelada em um único lugar, permitindo que todos acompanhem os dados da temporada e que apenas o organizador faça alterações.

## Funcionalidades atuais

- Cadastro de atletas com foto, camisa e posição.
- Área administrativa protegida por login.
- Estatísticas acumuladas de gols, assistências, craque, xerife e paredão.
- Ranking de artilharia, assistências, craque, xerife, paredão e presenças.
- Perfil individual dos atletas.
- Lista de presença por rodada.
- Montagem de confrontos entre times.
- Registro de gols e assistências em cada jogo.
- Decisão de empate por pênaltis ou ficha, sem somar gols extras na artilharia.
- Histórico de rodadas e linha do tempo dos confrontos.
- Destaques da última rodada.
- Integração com Supabase para dados, login e fotos.

## Tecnologias utilizadas

- HTML
- CSS
- JavaScript
- Supabase
- Git e GitHub

## Estrutura principal

```text
Site da galera da pelada/
├── index.html
├── styles.css
├── app.js
├── supabase-config.js
├── assets/
└── supabase/

```

## Organização no Git

A branch `main` contém a versão estável do site.

Novas funcionalidades devem ser criadas em branches próprias:

```text
feature/nome-da-funcionalidade
```

Correções usam:

```text
fix/nome-da-correcao
```

Documentações usam:

```text
docs/nome-do-documento
```
