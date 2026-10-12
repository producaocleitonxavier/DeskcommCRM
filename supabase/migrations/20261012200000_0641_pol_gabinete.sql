-- manifest: tabelas pol_liderancas, pol_projetos_lei, pol_emendas e extensão de demandas — módulo Gabinete do War Room 2.0, com gestão de lideranças (aniversários + WhatsApp), projetos de lei configuráveis por tipo de mandato, emendas parlamentares e rascunho de encaminhamento por IA nas demandas

-- ── pol_liderancas ──────────────────────────────────────────────────
-- Rede de lideranças políticas: cabos eleitorais, coordenadores de bairro,
-- presidentes de associação, vereadores aliados etc. Cada liderança é vinculada
-- a um contato (contacts) e opcionalmente a um lead político (pol_leads).
-- Campos de aniversário e WhatsApp são diretos para facilitar consulta rápida.
create table if not exists public.pol_liderancas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- Vínculo com contato e lead político
  contact_id uuid not null references public.contacts(id) on delete cascade,
  pol_lead_id uuid references public.pol_leads(id) on delete set null,

  -- Dados da liderança
  nome text not null,
  apelido text,
  cargo text, -- ex: "Presidente da Associação do Bairro X", "Cabo Eleitoral Zona Norte"
  tipo text not null default 'cabo_eleitoral'
    check (tipo in (
      'cabo_eleitoral', 'coordenador_bairro', 'coordenador_cidade',
      'lider_comunitario', 'vereador_aliado', 'presidente_associacao',
      'lider_religioso', 'lider_sindical', 'assessor', 'outro'
    )),

  -- Contato direto (duplicados de contacts para acesso rápido em listagens)
  whatsapp text, -- número com DDI, ex: 5531999999999
  aniversario date, -- dia/mês para alertas de aniversário

  -- Território de atuação
  territory_id uuid references public.pol_territories(id) on delete set null,
  cidade text,
  bairro text,
  zona_eleitoral text,

  -- Métricas de mobilização
  leads_mobilizados int not null default 0,
  eventos_organizados int not null default 0,
  ultimo_contato_em timestamptz,
  nivel_engajamento text not null default 'medio'
    check (nivel_engajamento in ('baixo', 'medio', 'alto', 'critico')),

  -- Status
  status text not null default 'ativo'
    check (status in ('ativo', 'inativo', 'suspenso')),
  observacoes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índices
create index if not exists idx_pol_liderancas_org
  on public.pol_liderancas(organization_id);
create index if not exists idx_pol_liderancas_contact
  on public.pol_liderancas(organization_id, contact_id);
create index if not exists idx_pol_liderancas_territory
  on public.pol_liderancas(organization_id, territory_id)
  where territory_id is not null;
create index if not exists idx_pol_liderancas_aniversario
  on public.pol_liderancas(organization_id, aniversario)
  where aniversario is not null;
create unique index if not exists uq_pol_liderancas_contact
  on public.pol_liderancas(organization_id, contact_id);

-- RLS
alter table public.pol_liderancas enable row level security;
drop policy if exists tenant_isolation_pol_liderancas_all on public.pol_liderancas;
create policy tenant_isolation_pol_liderancas_all on public.pol_liderancas
  using (organization_id = any(public.fn_user_org_ids()));

-- Revoke da anon (baseline pattern)
revoke all on public.pol_liderancas from anon;


-- ── pol_projetos_lei ────────────────────────────────────────────────
-- Projetos de lei, indicações, moções e requerimentos. Configurável por tipo
-- de mandato: vereador acompanha projetos municipais, deputado estadual
-- acompanha projetos na ALMG, deputado federal na Câmara/Senado.
create table if not exists public.pol_projetos_lei (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- Identificação do projeto
  numero text not null, -- ex: "PL 1234/2026", "Indicação 567/2026"
  tipo text not null default 'projeto_de_lei'
    check (tipo in (
      'projeto_de_lei', 'projeto_de_resolucao', 'projeto_de_emenda',
      'indicacao', 'mocao', 'requerimento', 'pedido_de_informacao',
      'projeto_de_decreto', 'outro'
    )),
  esfera text not null default 'municipal'
    check (esfera in ('municipal', 'estadual', 'federal')),

  -- Conteúdo
  titulo text not null,
  ementa text, -- resumo oficial
  descricao text, -- descrição interna da equipe
  tema text, -- ex: "Segurança Pública", "Educação", "Saúde"
  url_oficial text, -- link para o portal legislativo

  -- Autoria
  autor_mandatario boolean not null default true, -- true se é do próprio mandatário
  coautores text[], -- nomes dos coautores

  -- Tramitação
  data_apresentacao date,
  data_ultima_movimentacao date,
  status text not null default 'em_tramitacao'
    check (status in (
      'rascunho', 'apresentado', 'em_tramitacao', 'em_comissao',
      'aprovado_comissao', 'em_plenario', 'aprovado', 'vetado',
      'promulgado', 'arquivado', 'retirado'
    )),
  comissao_atual text, -- ex: "Comissão de Educação"
  relator text,

  -- Relevância política
  prioridade text not null default 'normal'
    check (prioridade in ('baixa', 'normal', 'alta', 'urgente')),
  alinhamento_campanha boolean not null default false,
  -- Temas da campanha que o projeto atende
  temas_campanha text[],

  -- Monitoramento
  alertas_ativos boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índices
create index if not exists idx_pol_projetos_lei_org
  on public.pol_projetos_lei(organization_id);
create index if not exists idx_pol_projetos_lei_status
  on public.pol_projetos_lei(organization_id, status);
create index if not exists idx_pol_projetos_lei_tipo
  on public.pol_projetos_lei(organization_id, tipo);
create unique index if not exists uq_pol_projetos_lei_numero
  on public.pol_projetos_lei(organization_id, numero);

-- RLS
alter table public.pol_projetos_lei enable row level security;
drop policy if exists tenant_isolation_pol_projetos_lei_all on public.pol_projetos_lei;
create policy tenant_isolation_pol_projetos_lei_all on public.pol_projetos_lei
  using (organization_id = any(public.fn_user_org_ids()));

revoke all on public.pol_projetos_lei from anon;


-- ── pol_emendas ─────────────────────────────────────────────────────
-- Emendas parlamentares (impositivas, de bancada, individuais).
-- Visível para Deputado Estadual/Federal e Vereador com orçamento.
-- Rastreia valores, destino (município/entidade) e status de execução.
create table if not exists public.pol_emendas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- Identificação
  numero text, -- número oficial, se houver
  ano int not null,
  tipo text not null default 'individual'
    check (tipo in (
      'individual', 'bancada', 'comissao', 'relator', 'pix'
    )),
  esfera text not null default 'estadual'
    check (esfera in ('municipal', 'estadual', 'federal')),

  -- Valores
  valor_indicado_cents bigint not null default 0,
  valor_empenhado_cents bigint not null default 0,
  valor_liquidado_cents bigint not null default 0,
  valor_pago_cents bigint not null default 0,
  currency text not null default 'BRL',

  -- Destino
  municipio text,
  entidade_beneficiada text, -- ex: "ONG Proteção à Criança"
  cnpj_entidade text,
  territory_id uuid references public.pol_territories(id) on delete set null,

  -- Finalidade
  area_tematica text not null default 'saude'
    check (area_tematica in (
      'saude', 'educacao', 'seguranca', 'assistencia_social',
      'infraestrutura', 'cultura', 'esporte', 'meio_ambiente',
      'agricultura', 'tecnologia', 'outro'
    )),
  descricao text not null,
  objeto text, -- descrição oficial do objeto

  -- Tramitação/Execução
  status text not null default 'indicada'
    check (status in (
      'rascunho', 'indicada', 'empenhada', 'liquidada',
      'paga', 'devolvida', 'cancelada'
    )),
  data_indicacao date,
  data_empenho date,
  data_liquidacao date,
  data_pagamento date,
  prazo_execucao date,

  -- Impacto político
  beneficiarios_estimados int,
  lideranca_id uuid references public.pol_liderancas(id) on delete set null,
  -- Liderança que intermediou a demanda
  visibilidade text not null default 'publica'
    check (visibilidade in ('publica', 'restrita')),

  observacoes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índices
create index if not exists idx_pol_emendas_org
  on public.pol_emendas(organization_id);
create index if not exists idx_pol_emendas_ano
  on public.pol_emendas(organization_id, ano);
create index if not exists idx_pol_emendas_status
  on public.pol_emendas(organization_id, status);
create index if not exists idx_pol_emendas_municipio
  on public.pol_emendas(organization_id, municipio)
  where municipio is not null;
create index if not exists idx_pol_emendas_territory
  on public.pol_emendas(organization_id, territory_id)
  where territory_id is not null;

-- RLS
alter table public.pol_emendas enable row level security;
drop policy if exists tenant_isolation_pol_emendas_all on public.pol_emendas;
create policy tenant_isolation_pol_emendas_all on public.pol_emendas
  using (organization_id = any(public.fn_user_org_ids()));

revoke all on public.pol_emendas from anon;


-- ── Extensão de demandas para Gabinete político ─────────────────────
-- Adiciona campos para uso político: tipo de demanda, território, liderança
-- que encaminhou, e rascunho de encaminhamento gerado por IA.
alter table public.demandas
  add column if not exists pol_tipo text
    check (pol_tipo in (
      'servico_publico', 'infraestrutura', 'saude', 'educacao',
      'seguranca', 'assistencia_social', 'meio_ambiente',
      'documentacao', 'emprego', 'outro'
    )),
  add column if not exists pol_territory_id uuid
    references public.pol_territories(id) on delete set null,
  add column if not exists pol_lideranca_id uuid
    references public.pol_liderancas(id) on delete set null,
  add column if not exists pol_encaminhamento_ia text,
  add column if not exists pol_orgao_destino text,
  add column if not exists pol_prioridade text default 'normal'
    check (pol_prioridade in ('baixa', 'normal', 'alta', 'urgente'));


-- ── GRANTS ──────────────────────────────────────────────────────────
-- Padrão do repo: authenticated tem acesso (RLS filtra); anon revogado acima.
grant select, insert, update, delete on public.pol_liderancas to authenticated;
grant select, insert, update, delete on public.pol_projetos_lei to authenticated;
grant select, insert, update, delete on public.pol_emendas to authenticated;

-- service_role bypassa RLS, mas já tem acesso por default.


-- ── Revoke de funções do public (hardening pattern) ─────────────────
-- Nenhuma função nova nesta migration. As tabelas são operadas via CRUD
-- direto com RLS — sem security definer necessária.
