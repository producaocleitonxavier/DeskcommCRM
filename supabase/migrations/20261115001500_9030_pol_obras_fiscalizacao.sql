-- manifest: 9030 — Gabinete: módulo OBRAS & FISCALIZAÇÃO (adaptativo por mandato). Uma obra/serviço/contrato público num território, com NATUREZA 'execucao' (Prefeito/Executivo gerencia contrato) ou 'fiscalizacao' (Vereador/Deputado fiscaliza). Satélites: vistorias (checklist/parecer/%) e fotos (com geo). Diferencial: vínculo a pol_emendas (fonte do recurso) e a pol_territories (peso eleitoral via intel). Tabelas pol_* multi-tenant (RLS tenant_isolation + fn_user_org_ids). Bucket privado gabinete-obras. Aditivo, faixa 9000+. APLICADA DIRETO via pg em 2026-10-20.

-- Entidade principal: a obra/serviço/contrato.
create table if not exists public.pol_obras (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  titulo text not null,
  natureza text not null default 'fiscalizacao' check (natureza in ('execucao', 'fiscalizacao')),
  tipo text not null default 'obra' check (tipo in ('obra', 'servico', 'contrato', 'convenio', 'equipamento', 'programa', 'outro')),
  area_tematica text check (area_tematica in ('saude','educacao','seguranca','assistencia_social','infraestrutura','mobilidade','cultura','esporte','meio_ambiente','agricultura','tecnologia','outro')),
  objeto text,
  orgao_responsavel text,
  empresa_nome text,
  empresa_cnpj text,
  numero_referencia text,
  valor_cents bigint not null default 0,
  currency text not null default 'BRL',
  fonte_recurso text,
  emenda_id uuid references public.pol_emendas(id) on delete set null,
  status text not null default 'planejada' check (status in ('planejada', 'em_andamento', 'paralisada', 'concluida', 'cancelada')),
  percentual int not null default 0 check (percentual between 0 and 100),
  municipio text,
  bairro text,
  territory_id uuid references public.pol_territories(id) on delete set null,
  latitude numeric,
  longitude numeric,
  data_inicio date,
  data_prevista date,
  data_conclusao date,
  responsavel_interno text,
  prioridade text not null default 'normal' check (prioridade in ('baixa', 'normal', 'alta', 'urgente')),
  visibilidade text not null default 'restrita' check (visibilidade in ('publica', 'restrita')),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_pol_obras_org on public.pol_obras(organization_id);
create index if not exists idx_pol_obras_status on public.pol_obras(organization_id, status);
create index if not exists idx_pol_obras_natureza on public.pol_obras(organization_id, natureza);
create index if not exists idx_pol_obras_territory on public.pol_obras(organization_id, territory_id) where territory_id is not null;
create index if not exists idx_pol_obras_emenda on public.pol_obras(emenda_id) where emenda_id is not null;
create index if not exists idx_pol_obras_municipio on public.pol_obras(organization_id, municipio) where municipio is not null;
alter table public.pol_obras enable row level security;
drop policy if exists tenant_isolation_pol_obras_all on public.pol_obras;
create policy tenant_isolation_pol_obras_all on public.pol_obras using (organization_id in (select public.fn_user_org_ids()));
revoke all on public.pol_obras from anon;
grant select, insert, update, delete on public.pol_obras to authenticated;

-- Vistorias (inspeções em campo): checklist + parecer + % execução.
create table if not exists public.pol_obra_vistorias (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  obra_id uuid not null references public.pol_obras(id) on delete cascade,
  data date not null default current_date,
  situacao text not null default 'em_andamento' check (situacao in ('conforme', 'irregular', 'paralisada', 'concluida', 'em_andamento')),
  percentual int check (percentual between 0 and 100),
  parecer text,
  checklist jsonb not null default '[]'::jsonb,
  responsavel text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_pol_obra_vistorias_obra on public.pol_obra_vistorias(organization_id, obra_id, data desc);
alter table public.pol_obra_vistorias enable row level security;
drop policy if exists tenant_isolation_pol_obra_vistorias_all on public.pol_obra_vistorias;
create policy tenant_isolation_pol_obra_vistorias_all on public.pol_obra_vistorias using (organization_id in (select public.fn_user_org_ids()));
revoke all on public.pol_obra_vistorias from anon;
grant select, insert, update, delete on public.pol_obra_vistorias to authenticated;

-- Fotos (evidências) com geolocalização.
create table if not exists public.pol_obra_fotos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  obra_id uuid not null references public.pol_obras(id) on delete cascade,
  vistoria_id uuid references public.pol_obra_vistorias(id) on delete set null,
  storage_path text not null,
  legenda text,
  latitude numeric,
  longitude numeric,
  tirada_em timestamptz,
  media_mime text,
  media_size_bytes bigint,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_pol_obra_fotos_obra on public.pol_obra_fotos(organization_id, obra_id, created_at);
alter table public.pol_obra_fotos enable row level security;
drop policy if exists tenant_isolation_pol_obra_fotos_all on public.pol_obra_fotos;
create policy tenant_isolation_pol_obra_fotos_all on public.pol_obra_fotos using (organization_id in (select public.fn_user_org_ids()));
revoke all on public.pol_obra_fotos from anon;
grant select, insert, update, delete on public.pol_obra_fotos to authenticated;

-- Bucket privado das fotos de obra (20MB, imagens + PDF de documentos/contratos).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gabinete-obras', 'gabinete-obras', false, 20971520, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
