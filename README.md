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
- Distinção entre mensalistas e diaristas, preservando o histórico da temporada.
- Integração com Supabase para dados, login e fotos.

## Notificações de solicitações de presença

O envio de e-mail aos administradores usa uma função serverless da Vercel e a API da Resend. Configure estas variáveis somente no ambiente da Vercel:

```text
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
ATTENDANCE_NOTIFICATION_EMAILS
ATTENDANCE_FROM_EMAIL
SITE_URL
```

`ATTENDANCE_NOTIFICATION_EMAILS` aceita vários destinatários separados por vírgula. Nunca exponha a `SUPABASE_SERVICE_ROLE_KEY` no navegador ou em arquivos versionados.

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
