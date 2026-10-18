-- manifest: 9015 — Modulo Inteligencia (War Room 2.0), Pilar 1 (Analise Eleitoral/TSE): tabelas de referencia intel_elections, intel_municipios e intel_election_results com os resultados do TSE agregados por MUNICIPIO (MG, 2022/2024/2026, todos os cargos). Sao DADOS PUBLICOS e GLOBAIS (sem organization_id): RLS habilitada com leitura para qualquer autenticado e escrita so por service_role (seed embarcado pela GIP). O cruzamento voto x base (leads) e feito ao vivo por ibge_code, sem tabela por org nesta fase. ibge_code casa com a malha municipal (GeoJSON) do choropleth. Aditivo, faixa 9000+ reservada para migrations proprietarias do fork (ver docs/politico-fork-strategy.md).

-- =====================================================================
-- intel_elections — uma linha por (ano, turno, cargo, uf)
-- =====================================================================
create table if not exists public.intel_elections (
  id         bigint generated always as identity primary key,
  ano        smallint not null,
  turno      smallint not null default 1,
  cargo_cod  smallint not null,                 -- CD_CARGO do TSE (3=Gov, 6=Dep Fed, 7=Dep Est, 11=Prefeito, 13=Vereador)
  cargo      text     not null,                 -- DS_CARGO ('Governador', 'Prefeito', ...)
  uf         char(2)  not null,
  created_at timestamptz not null default now(),
  unique (ano, turno, cargo_cod, uf)
);

-- =====================================================================
-- intel_municipios — referencia geografica (IBGE x TSE) por municipio
-- =====================================================================
create table if not exists public.intel_municipios (
  ibge_code char(7) primary key,                -- codigo IBGE (casa com a malha/GeoJSON)
  tse_code  text    not null,                   -- CD_MUNICIPIO do TSE
  nome      text    not null,
  uf        char(2) not null,
  latitude  numeric,                            -- centroide (opcional, preenchido depois)
  longitude numeric
);
create index if not exists intel_municipios_tse_idx on public.intel_municipios (tse_code);
create index if not exists intel_municipios_uf_idx on public.intel_municipios (uf);

-- =====================================================================
-- intel_election_results — votos agregados por municipio x candidato
-- =====================================================================
create table if not exists public.intel_election_results (
  id          bigint generated always as identity primary key,
  election_id bigint  not null references public.intel_elections(id) on delete cascade,
  ibge_code   char(7) not null,                 -- junta com intel_municipios / choropleth
  tse_code    text    not null,
  municipio   text    not null,
  nr_votavel  text    not null,                 -- numero do candidato (ou 95/96 = branco/nulo)
  nm_votavel  text    not null,
  partido_num smallint,                         -- derivado dos 2 primeiros digitos (majoritarios)
  votos       int     not null default 0
);
create index if not exists intel_results_election_mun_idx on public.intel_election_results (election_id, ibge_code);
create index if not exists intel_results_mun_idx on public.intel_election_results (ibge_code);
create index if not exists intel_results_election_votos_idx on public.intel_election_results (election_id, votos desc);

-- =====================================================================
-- RLS — dados PUBLICOS: leitura para qualquer autenticado; escrita so
-- por service_role (que ignora RLS). anon sem acesso.
-- =====================================================================
alter table public.intel_elections        enable row level security;
alter table public.intel_municipios        enable row level security;
alter table public.intel_election_results  enable row level security;

drop policy if exists intel_elections_read on public.intel_elections;
create policy intel_elections_read on public.intel_elections for select
  to authenticated using (true);

drop policy if exists intel_municipios_read on public.intel_municipios;
create policy intel_municipios_read on public.intel_municipios for select
  to authenticated using (true);

drop policy if exists intel_election_results_read on public.intel_election_results;
create policy intel_election_results_read on public.intel_election_results for select
  to authenticated using (true);

grant select on public.intel_elections       to authenticated;
grant select on public.intel_municipios       to authenticated;
grant select on public.intel_election_results to authenticated;
revoke all on public.intel_elections       from anon;
revoke all on public.intel_municipios       from anon;
revoke all on public.intel_election_results from anon;

notify pgrst, 'reload schema';
