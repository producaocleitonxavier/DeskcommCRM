-- manifest: 9056 — Indicação (member-get-member) do funil político. Cada pessoa engajada ganha um CÓDIGO pessoal; quem chega com o código dela é creditado como INDICADO (mede "quantas pessoas ela trouxe" — o sinal mais forte do funil, o Multiplicador). Sem link de download: o compartilhado abre uma conversa no WhatsApp (receptivo). Aditivo, faixa 9000+ do fork.

-- Código de indicação por contato (o que a pessoa compartilha: [ind:CODE]).
alter table public.contacts add column if not exists codigo_indicacao text;
create unique index if not exists uq_contacts_codigo_indicacao
  on public.contacts(organization_id, codigo_indicacao)
  where codigo_indicacao is not null;

-- Quem trouxe quem. Um INDICADO é creditado a UM indicador (first-touch).
create table if not exists public.pol_indicacoes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  indicador_contact_id uuid not null references public.contacts(id) on delete cascade,
  indicado_contact_id uuid not null references public.contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Cada pessoa indicada entra uma vez (quem a trouxe não muda).
  unique (organization_id, indicado_contact_id),
  -- Ninguém indica a si mesmo.
  check (indicador_contact_id <> indicado_contact_id)
);

create index if not exists idx_pol_indicacoes_org on public.pol_indicacoes(organization_id);
create index if not exists idx_pol_indicacoes_indicador on public.pol_indicacoes(organization_id, indicador_contact_id);

alter table public.pol_indicacoes enable row level security;
drop policy if exists tenant_isolation_pol_indicacoes_all on public.pol_indicacoes;
create policy tenant_isolation_pol_indicacoes_all on public.pol_indicacoes
  using (organization_id in (select public.fn_user_org_ids()));

revoke all on public.pol_indicacoes from anon;
grant select, insert, update, delete on public.pol_indicacoes to authenticated;

notify pgrst, 'reload schema';
