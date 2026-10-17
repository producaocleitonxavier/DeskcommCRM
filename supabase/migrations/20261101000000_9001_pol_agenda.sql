-- manifest: 9001 — tabela pol_agenda (Gabinete/War Room): agenda do mandato (reunioes, visitas, audiencias, eventos, ligacoes, compromissos) ligada a territorio/lideranca/contato/assessor. Faixa 9000+ reservada para migrations proprietarias do fork (ver docs/politico-fork-strategy.md). RLS tenant_isolation na forma "in (select fn_user_org_ids())" compativel com o Postgres do Supabase.

create table if not exists public.pol_agenda (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  titulo          text        not null,
  descricao       text,
  tipo            text        not null default 'compromisso'
                  check (tipo in ('reuniao', 'visita', 'audiencia', 'evento', 'ligacao', 'compromisso', 'outro')),
  data_inicio     timestamptz not null,
  data_fim        timestamptz,
  dia_inteiro     boolean     not null default false,
  status          text        not null default 'agendado'
                  check (status in ('agendado', 'confirmado', 'concluido', 'cancelado')),
  local           text,
  municipio       text,
  territory_id    uuid        references public.pol_territories(id) on delete set null,
  lideranca_id    uuid        references public.pol_liderancas(id) on delete set null,
  contact_id      uuid        references public.contacts(id) on delete set null,
  assessor_id     uuid        references auth.users(id) on delete set null,
  observacoes     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.pol_agenda enable row level security;

drop policy if exists tenant_isolation_pol_agenda_all on public.pol_agenda;
create policy tenant_isolation_pol_agenda_all on public.pol_agenda for all
  using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));

create index if not exists pol_agenda_org_inicio_idx on public.pol_agenda (organization_id, data_inicio);

grant select, insert, update, delete on public.pol_agenda to authenticated;
revoke all on public.pol_agenda from anon;
