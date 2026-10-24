-- manifest: 9045 — Local/Escola (pol_locais): a entidade que AGRUPA eventos e pessoas de um mesmo lugar (escola, igreja, associação...) no funil de eventos. Nome, tipo, bairro/cidade/CEP, zona eleitoral (derivada depois) e endereço, por organização. Liga a pol_events via nova coluna local_id. Base da Fase 2 (card da escola → cadastros amarrados). Aditivo, faixa 9000+ do fork.

create table if not exists public.pol_locais (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  nome text not null,
  tipo text not null default 'escola' check (tipo in ('escola','igreja','associacao','empresa','comunidade','sindicato','ong','rua_de_lazer','praca','feira','outro')),
  bairro text,
  cidade text,
  uf char(2),
  cep text,
  zona_eleitoral text,
  endereco text,
  notas text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pol_locais_org on public.pol_locais(organization_id);
create index if not exists idx_pol_locais_ativo on public.pol_locais(organization_id, ativo);

alter table public.pol_locais enable row level security;
drop policy if exists tenant_isolation_pol_locais_all on public.pol_locais;
create policy tenant_isolation_pol_locais_all on public.pol_locais
  using (organization_id in (select public.fn_user_org_ids()));

revoke all on public.pol_locais from anon;
grant select, insert, update, delete on public.pol_locais to authenticated;

-- Liga cada evento a um local (opcional): vários eventos/visitas agrupam sob um local.
alter table public.pol_events
  add column if not exists local_id uuid references public.pol_locais(id) on delete set null;
create index if not exists idx_pol_events_local on public.pol_events(local_id) where local_id is not null;

notify pgrst, 'reload schema';
