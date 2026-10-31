-- 9074 — HISTÓRICO DO BOLETIM SEMANAL (pol_boletins)
--
-- Por que existe: o cron de segunda-feira (api/v1/cron/boletim-semanal) hoje só
-- REFRESCA a escuta (imprensa/IG/sinais). Esta tabela guarda uma EDIÇÃO do
-- boletim por semana — o snapshot já sintetizado (sentimento, pautas, dores,
-- adversários, ações) + o resumo da IA — pra o gabinete abrir no app o histórico
-- ("última edição + semanas anteriores") sem recalcular. Entrega IN-APP primeiro
-- (decisão de canal, 31/out); e-mail (Resend) é fast-follow quando configurado.
--
-- Multi-tenant: mesma convenção das demais pol_* — RLS por organização via
-- public.fn_user_org_ids(). O cron escreve com a service_role (bypassa RLS).

create table if not exists public.pol_boletins (
  id                 uuid         primary key default gen_random_uuid(),
  organization_id    uuid         not null references public.organizations(id) on delete cascade,

  -- Janela coberta pela edição (segunda anterior → domingo, normalmente).
  periodo_inicio     date,
  periodo_fim        date,

  -- Escopo da inteligência no momento da geração ("Belo Horizonte / MG",
  -- "Minas Gerais", "Brasil"), pra a edição antiga continuar legível mesmo que o
  -- mandato mude de abrangência depois.
  escopo             text,

  -- "A semana em poucas frases" — texto curto gerado pela IA.
  resumo             text,

  -- Snapshot COMPLETO da edição (sentimento semana vs anterior, pautas, dores,
  -- adversários, ações). Guardado cru pra a tela remontar o boletim e pra PDF.
  dados              jsonb        not null default '{}'::jsonb,

  -- 'cron' (segunda automática) ou 'manual' (gerado na tela).
  origem             text         not null default 'cron',

  gerado_em          timestamptz  not null default now(),
  created_at         timestamptz  not null default now()
);

-- Uma edição por org por semana (idempotência do cron): se rodar duas vezes na
-- mesma janela, faz UPSERT em vez de duplicar. periodo_inicio é a chave natural.
create unique index if not exists uq_pol_boletins_org_periodo
  on public.pol_boletins (organization_id, periodo_inicio);

create index if not exists idx_pol_boletins_org_data
  on public.pol_boletins (organization_id, gerado_em desc);

alter table public.pol_boletins enable row level security;

-- Sem policy = deny-all (lição das pol_*). Membros da org leem/gerenciam a sua;
-- o cron usa service_role e não depende disto.
drop policy if exists tenant_isolation_pol_boletins_all on public.pol_boletins;
create policy tenant_isolation_pol_boletins_all
  on public.pol_boletins
  for all
  using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));
