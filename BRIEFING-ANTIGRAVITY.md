# Briefing — War Room 2.0 (DeskcommCRM)

> Instruções para sessão de código no Antigravity / Codex / Claude Code.
> Leia **CLAUDE.md** antes de qualquer coisa — ele é a doutrina do repo.

---

## Estado atual da branch

**Branch:** `feat/warroom-2.0-instagram-automation`
**Fork:** `producaocleitonxavier/DeskcommCRM` → PR para `melgarafael/DeskcommCRM`
**Commit mais recente:** `5602fc923` — 74 arquivos alterados, ~15.700 linhas adicionadas

---

## O que JÁ ESTÁ FEITO (não refazer)

### ✅ Fase A — Design Tokens (globals.css)
- Fontes: Urbanist (headings) + Figtree (body) — arquivos woff2 em `app/fonts/`
- Paleta War Room 2.0 completa: background `#ECECE7`, cards `#FFFFFF`, semáforo, funnel blues
- Classes utilitárias: `.wr-card`, `.wr-btn-dark`, `.font-heading`
- Layout em `app/layout.tsx` com font variables

### ✅ Fase B — Sidebar reorganizada
- `lib/navigation/catalogo.ts` — entradas consolidadas de ~80 para ~10 itens visíveis
- `components/shell/Sidebar.tsx` — logo WR, section labels, active state com lime
- Seções: Hoje, Pessoas, Território, Gabinete, Instagram, CRM, Configurações

### ✅ Fase C — AppShell / componentes base
- `components/ui/card.tsx` — border-radius 22px, shadow WR2
- `components/ui/button.tsx` — pill radius 999px

### ✅ Fase D — 5 páginas-chave (visual completo WR2)
1. `app/app/politico/page.tsx` — **Hoje** (KPIs, funil, alertas, atividade recente)
2. `app/app/politico/leads/page.tsx` — **Pessoas** (lista filtrada, busca, cards)
3. `app/app/politico/leads/[id]/page.tsx` — **Ficha** (perfil, timeline, score, ações)
4. `app/app/politico/mapa-eleitoral/page.tsx` — **Território** (mapa, zonas, seções)
5. `app/app/politico/demandas/page.tsx` — **Gabinete** (demandas, lideranças, projetos)

### ✅ Fase E — Instagram Hub (6 páginas, visual completo WR2)
1. `app/app/instagram/page.tsx` — Hub principal
2. `app/app/instagram/automacoes/page.tsx` — Lista de flows
3. `app/app/instagram/automacoes/novo/page.tsx` — Criar flow
4. `app/app/instagram/automacoes/[id]/page.tsx` — Editar flow
5. `app/app/instagram/webhooks/page.tsx` — Tokens de webhook
6. `app/app/instagram/etiquetas/page.tsx` — Etiquetas

### ✅ Backend Instagram — ManyChat próprio
- **Tabelas** (migration 0629, no baseline):
  - `ig_automation_flows` — flows de automação (trigger + ações)
  - `ig_comment_events` — eventos de comentário recebidos
  - `ig_webhook_tokens` — tokens para URL de webhook
  - Todas com RLS `tenant_isolation_*` via `fn_user_org_ids()`

- **API Routes:**
  - `GET|POST /api/v1/ig-automation-flows` — listar/criar flows
  - `GET|PATCH|DELETE /api/v1/ig-automation-flows/[id]` — detalhe/atualizar/excluir
  - `GET|POST /api/v1/ig-webhook-tokens` — listar/criar tokens
  - `DELETE /api/v1/ig-webhook-tokens/[id]` — revogar token

- **Webhook handler:** `app/api/v1/webhooks/instagram-comments/[token]/route.ts` (183 linhas)
- **Motor de automação:** `lib/ig-automacoes/motor.handler.ts` (279 linhas)
- **Executor de ações:** `lib/ig-automacoes/acoes.ts` (426 linhas)
- **Ingestão de comentários:** `lib/channels/instagram/comment-ingest.ts` (112 linhas)

### ✅ Backend Político (migrations 0630-0641)
- 13 migrations: pol_core, pol_territories, pol_social, pol_opponents, pol_narratives, pol_call_queue, pol_events, pol_invisible_funnel, pol_surveys, pol_intelligence, pol_views, pol_gabinete
- 10 views PostgreSQL (pol_vw_*)
- API routes para: pol-leads, pol-territories, pol-opponents, pol-narratives, pol-social-profiles, pol-events, pol-call-queue, pol-surveys, pol-alerts, pol-content-generator, pol-invisible-funnel

---

## O QUE FALTA FAZER (próximas fases)

### Fase F — Integração real Instagram Graph API

O motor está pronto mas falta a **conexão real com a API do Meta**:

1. **OAuth flow Instagram Business**
   - Tela de conexão em `/app/instagram/conectar`
   - Salvar `access_token` e `page_id` em `channel_sessions`
   - Renovação automática do token (long-lived, 60 dias)

2. **Envio real de DMs e respostas a comentários**
   - `lib/channels/instagram/send-dm.ts` — POST para `/{user_id}/messages`
   - `lib/channels/instagram/reply-comment.ts` — POST para `/{comment_id}/replies`
   - Rate limiting: respeitar limites da Graph API

3. **Busca de perfil do seguidor**
   - Quando trigger `novo_seguidor` dispara, buscar dados públicos
   - Preencher `contacts.social_identity`, `source_metadata`

4. **Verificação de webhook Meta**
   - O handler em `webhooks/instagram-comments/[token]` já recebe POST
   - Falta: GET para challenge de verificação (`hub.verify_token`)

### Fase G — Deploy e migração de dados

1. **Migração de 18.356 contatos do War Room v1**
   - Script de ETL: War Room v1 (Postgres separado) → `contacts` + `pol_leads`
   - Mapeamento de campos: support_level, territory, zona/seção eleitoral
   - Deduplicação por `phone_number` + `cpf_hash`

2. **Deploy em warromcleitonxavier.cloud**
   - Aplicar baseline.sql no Supabase de produção
   - Configurar WAHA, Redis, envs de produção
   - Testar webhook Instagram com conta real do cliente

### Fase H — Módulos faltantes do Gabinete

1. **Lideranças** (`/app/politico/liderancas`)
   - Página existe com visual WR2 mas precisa de backend CRUD
   - Aniversários + integração WhatsApp (envio automático)
   - Líder ↔ contatos vinculados (quantos votos esse líder mobiliza)

2. **Projetos de Lei** (`/app/politico/projetos-lei`)
   - Página existe mas sem backend
   - Configurável por tipo de mandato (vereador vs deputado vs prefeito)
   - Timeline de tramitação

3. **Emendas** (`/app/politico/emendas`)
   - Só para Deputado/Prefeito
   - Valor, destino, status de execução

### Fase I — Raio-X de Votos

4 telas (todas com visual WR2):
1. **Consulta** — busca por zona/seção, histórico do eleitor
2. **Território** — mapa de calor por bairro/zona
3. **Evolução** — gráficos de crescimento da base
4. **Ação** — listas de contato para operação de campo

### Fase J — Inteligência e automação avançada

1. **Decision Engine** (IA)
   - Sugestões automáticas de próxima ação por lead
   - Score político calculado com base em interações
   - Alertas inteligentes

2. **Motor Viral**
   - Compartilhamento em cadeia com tracking
   - Gamificação de engajamento

3. **Narrativas** — monitoramento de menções e contra-narrativa
4. **Adversários** — perfil competitivo com fontes públicas

---

## Regras de ouro do repo (resumo — lei completa no CLAUDE.md)

1. **Multi-tenancy:** `organization_id` em toda tabela, RLS com `fn_user_org_ids()`, NUNCA confiar no body para org
2. **Schema em tripla:** migration em `supabase/migrations/` + apêndice no `baseline.sql` + `-- manifest:` no cabeçalho
3. **Auth:** sempre `getUser()`, nunca `getSession()`. Roles: viewer < agent < manager < admin
4. **API:** REST `/api/v1/`, snake_case, wrappers `ok()`/`fail()` de `lib/api/wrappers.ts`, `X-Request-Id` em toda response
5. **Audit:** toda mutação POST/PATCH/DELETE → `api_audit_log`
6. **Suporte:** handler mutante declara `requireSupportWrite()` antes do efeito
7. **Tabelas pol_*:** prefixo `pol_` para todas as tabelas políticas; views `pol_vw_*`
8. **Próxima migration:** verificar com `pnpm checar:colisao-de-migration`
9. **Antes de PR:** `pnpm gov:verify` (typecheck + lint + unit) + `pnpm test:db` se mexeu em schema

---

## Design System War Room 2.0 (referência rápida)

```css
/* Fundo */         background: #ECECE7
/* Card */          background: #FFFFFF; border-radius: 22px; box-shadow: 0 1px 2px rgba(22,24,29,.05)
/* Texto 1 */       color: #16181D
/* Texto 2 */       color: #4A4F59
/* Texto 3 */       color: #5B606B
/* Meta */          color: #9A9D8F; font-size: 11px
/* Accent lime */   #D7F36A (foco/destaque, NUNCA status)
/* Botão dark */    background: #16181D; color: #FFFFFF; border-radius: 999px; min-height: 44px
/* Botão sec */     border: 1px solid #DCDCD5; background: #FFFFFF; color: #4A4F59; border-radius: 999px
/* Botão danger */  border: 1px solid #FBE4E2; color: #A3302A
/* Semáforo OK */   background: #E2F5EC; color: #17784F
/* Semáforo Warn */ background: #FCF1DC; color: #8A5A10
/* Semáforo Risk */ background: #FBE4E2; color: #A3302A
/* Pill ação */     background: #E4E7F8; color: #2F3DA8
/* Pill inativo */  background: #F0F0EB; color: #5B606B
/* Funil 1-5 */     #C9CEF3 → #9AA5EA → #6B79DD → #4352C4 → #26318F
/* Input */         border: 1px solid #DCDCD5; border-radius: 999px; padding: 10px 16px
/* Textarea */      border-radius: 12px (em vez de 999px)
/* Divider */       border-bottom: 1px solid #F0F0EB
/* Hover row */     background: #F6F6F2
/* Loading */       border-color: #4352C4; border-top-color: transparent
/* Section label */ font-size: 11px; font-weight: 600; color: #9A9D8F; letter-spacing: .08em; text-transform: uppercase
/* Page layout */   mx-auto max-w-[1140px] px-4 py-7 space-y-[18px]
/* Form layout */   max-w-[720px]
/* Heading */       font-heading text-[36px] font-bold leading-tight
/* KPI value */     font-heading text-[28px] font-bold tabular-nums
/* KPI label */     text-[13px] font-medium color: #4A4F59
```

---

## Arquivos protegidos (NUNCA modificar)

- `CentroInteligencia.tsx`
- `viralEngine.ts`
- `useStrategicActions.ts`
- `MonitoramentoPage.tsx`
- `MobilizationFunnel.tsx`
- `useUpdateLeadStage.ts`
- `WarRoomPage.tsx`

---

## Prioridade sugerida

1. **Fase F** (Instagram real) — é o que o cliente Cleiton precisa AGORA
2. **Fase G** (deploy + migração) — ter o sistema no ar
3. **Fase H** (Gabinete backend) — completar o que a UI já mostra
4. **Fases I-J** — inteligência e automação avançada

Ao escolher uma fase, implemente **completamente** antes de passar para a próxima.
