-- manifest: 9009 — historico/linha do tempo da demanda (Gabinete/War Room): tabela pol_demanda_eventos registra os marcos do atendimento (oficio emitido, cidadao avisado por WhatsApp, mudanca de status, nota) para transparencia e auditoria. O evento "registrada" e sintetico (derivado de aberta_em na tela). Aditivo, faixa 9000+ reservada para migrations proprietarias do fork (ver docs/politico-fork-strategy.md).

create table if not exists public.pol_demanda_eventos (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  demanda_id      uuid        not null references public.demandas(id) on delete cascade,
  tipo            text        not null default 'nota'
                  check (tipo in ('registrada', 'encaminhamento_ia', 'oficio_emitido', 'cidadao_avisado', 'estado_alterado', 'nota')),
  descricao       text,
  created_by      uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

alter table public.pol_demanda_eventos enable row level security;

drop policy if exists tenant_isolation_pol_demanda_eventos_all on public.pol_demanda_eventos;
create policy tenant_isolation_pol_demanda_eventos_all on public.pol_demanda_eventos for all
  using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));

create index if not exists pol_demanda_eventos_demanda_idx
  on public.pol_demanda_eventos (organization_id, demanda_id, created_at);

grant select, insert, update, delete on public.pol_demanda_eventos to authenticated;
revoke all on public.pol_demanda_eventos from anon;

notify pgrst, 'reload schema';
