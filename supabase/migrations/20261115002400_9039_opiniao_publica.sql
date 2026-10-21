-- manifest: 9039 — Pilar 2 (Inteligência): OPINIÃO PÚBLICA / escuta social. Espelha (simplificado, no Supabase, sem ClickHouse) o fato_escuta_social do SAM: menções de imprensa/redes com polaridade, tópico e território. intel_monitor_config = termos que a org monitora (nome do candidato, cidade, bairros, temas). intel_mentions = cada menção captada (imprensa via RSS na Fase 1; comentários IG via ManyChat na Fase 1b), classificada por IA (polaridade -1..+1, sentimento, tópico). Org-scoped, RLS. Aditivo, faixa 9000+. APLICADA DIRETO via pg em 2026-10-21.

create table if not exists public.intel_monitor_config (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  termos_nome text[] not null default '{}',   -- nome(s) do candidato/mandato a monitorar
  cidade text,                                 -- cidade-base da operação
  bairros text[] not null default '{}',        -- bairros de interesse
  temas text[] not null default '{}',          -- pautas (segurança, saúde, buraco, etc.)
  updated_at timestamptz not null default now()
);
alter table public.intel_monitor_config enable row level security;
drop policy if exists tenant_isolation_intel_monitor_config_all on public.intel_monitor_config;
create policy tenant_isolation_intel_monitor_config_all on public.intel_monitor_config for all
  using (organization_id in (select public.fn_user_org_ids())) with check (organization_id in (select public.fn_user_org_ids()));
grant select, insert, update, delete on public.intel_monitor_config to authenticated;

create table if not exists public.intel_mentions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  canal text not null,                 -- 'imprensa' | 'instagram' | 'twitter' | 'web'
  fonte text,                          -- veículo/handle (ex.: 'G1', '@fulano')
  autor text,
  autor_seguidores int,
  titulo text,
  conteudo text,
  url text,
  publicado_em timestamptz,
  polaridade real,                     -- -1.00 (detrator) a +1.00 (aliado)
  sentimento text,                     -- 'positivo' | 'neutro' | 'negativo'
  topico text,                         -- cluster de tópico (ex.: 'saúde', 'segurança')
  municipio text,
  bairro text,
  termo text,                          -- termo monitorado que casou
  processado boolean not null default false, -- sentimento/tópico já classificado?
  created_at timestamptz not null default now()
);
create unique index if not exists uq_intel_mentions_org_url on public.intel_mentions(organization_id, url) where url is not null;
create index if not exists idx_intel_mentions_org_data on public.intel_mentions(organization_id, publicado_em desc);
create index if not exists idx_intel_mentions_org_sent on public.intel_mentions(organization_id, sentimento);

alter table public.intel_mentions enable row level security;
drop policy if exists tenant_isolation_intel_mentions_all on public.intel_mentions;
create policy tenant_isolation_intel_mentions_all on public.intel_mentions for all
  using (organization_id in (select public.fn_user_org_ids())) with check (organization_id in (select public.fn_user_org_ids()));
grant select, insert, update, delete on public.intel_mentions to authenticated;
revoke all on public.intel_monitor_config from anon;
revoke all on public.intel_mentions from anon;

notify pgrst, 'reload schema';
