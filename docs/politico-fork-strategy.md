# Estratégia de fork e upstream — módulo político (War Room)

> Régua para o time, à medida que o War Room vira produto/SaaS sobre o DeskcommCRM.

## Contexto

- O **módulo político (`pol_*`, telas `/app/politico/*`, views `pol_vw_*`)** é **desenvolvimento proprietário deste fork** (`producaocleitonxavier/DeskcommCRM`). **Não existe no upstream** (`melgarafael/DeskcommCRM`).
- O fork nasceu de um upstream ~migration `0629`. O upstream já está em `0686+` e cresce rápido (CRM base: inbox, WAHA/WhatsApp, agentes de IA, auth, RLS, instalador self-host).
- As migrations do político ocupam **`0630`–`0644`** — **os mesmos números** que o upstream usou para migrations **diferentes**. Isso **colide** num `git merge upstream`.

## Postura: soft-fork

O diferencial competitivo é o **político**, não o CRM base. Então:

1. **Não perseguir o upstream continuamente.** Sincronizar em janelas deliberadas, não a cada release deles.
2. **Cherry-pick** apenas correções de segurança/infra críticas do upstream, quando necessário.
3. Concentrar energia nas features do político (o moat).

## Regra de numeração de migration (vale a partir de agora)

- **Toda migration proprietária nova usa `NNNN ≥ 9000`** (ex.: `20261101000000_9001_pol_xxx.sql`). O upstream não chega lá tão cedo → zero colisão.
- As existentes (`0630`–`0644`) só serão renumeradas para a faixa reservada **durante** a primeira sincronização (ver abaixo) — renomear migration já aplicada fora disso quebra o `supabase_migrations.schema_migrations`.

## Gotcha de RLS no Supabase (já corrigido na 0644)

Em policy no **Supabase**, nunca use `coluna = any(fn_srf())` quando a função retorna `SETOF` — o Postgres rejeita ("set-returning functions are not allowed in policy expressions") e a policy **não é criada** (tabela vira deny-all). Use sempre **`coluna in (select fn_srf())`**. Todas as `pol_*` seguem esse padrão desde a migration `0644`.

## Procedimento da primeira sincronização com upstream (projeto dedicado)

Fazer numa janela própria, fora de produção, com teste — nunca reativo:

1. `git remote add upstream https://github.com/melgarafael/DeskcommCRM.git && git fetch upstream`.
2. Branch de sync a partir de `upstream/main`.
3. Reaplicar o político por cima, **renumerando** as migrations `0630`–`0644` para a faixa `9000+` (e ajustando o `baseline.sql`).
4. Resolver conflitos do CRM base (grande — ~57 migrations de divergência).
5. `pnpm test:db` (Postgres efêmero + baseline + invariantes) e `pnpm build`.
6. Validar `supabase_migrations.schema_migrations` e o fluxo de deploy antes de tocar produção.

## Como o schema chega hoje

- `package.json` `db:migrate` é stub (`TODO`). O schema de instalação vem do **`baseline.sql`** (kit self-host).
- Produção tem `supabase_migrations.schema_migrations` (já usaram `supabase db push`); mudanças pontuais têm sido aplicadas por SQL direto. Qualquer renumeração precisa considerar esse tracking.
