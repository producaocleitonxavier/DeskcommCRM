-- manifest: 9090 — Trava de COBAIA: allowlist de destino + botão de pânico, para o teste em escala.
--
-- POR QUE EXISTE: o teste de entregabilidade em escala roda numa ORG-COBAIA
-- (gabinete-fantasma de laboratório) com base fictícia nossa. A LINHA VERMELHA
-- (zero envio para contato real de cliente/eleitor) não pode depender de
-- disciplina — vira trava no banco + no caminho de envio:
--   · pol_cobaia_controle: marca a org como laboratório (modo_cobaia) e tem o
--     BOTÃO DE PÂNICO (envio_pausado) que para TODO disparo dela na hora.
--   · pol_cobaia_semente: a allowlist — os ÚNICOS telefones que podem receber.
--     Em modo_cobaia, o disparo recusa qualquer destino fora desta lista.
--
-- Org REAL (de cliente) NÃO tem linha em pol_cobaia_controle → nenhuma restrição,
-- comportamento normal. A trava só morde o laboratório. Aditivo e idempotente.

-- ─── pol_cobaia_controle: 1 linha por org-cobaia (flag de laboratório + pânico) ─
create table if not exists public.pol_cobaia_controle (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  -- true = esta org é laboratório; o disparo só manda para telefone da allowlist.
  modo_cobaia boolean not null default true,
  -- BOTÃO DE PÂNICO: true para TODO disparo de campanha desta org na hora.
  envio_pausado boolean not null default false,
  -- Nota livre (ex.: "cobaia do teste de escala nov/26").
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pol_cobaia_controle enable row level security;
drop policy if exists tenant_isolation_pol_cobaia_controle_all on public.pol_cobaia_controle;
create policy tenant_isolation_pol_cobaia_controle_all on public.pol_cobaia_controle
  using (organization_id in (select public.fn_user_org_ids()));

revoke all on public.pol_cobaia_controle from anon;
grant select, insert, update, delete on public.pol_cobaia_controle to authenticated;

-- ─── pol_cobaia_semente: a allowlist de telefones que PODEM receber ────────────
create table if not exists public.pol_cobaia_semente (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- O telefone-semente. Guardado como veio; a comparação é por SÓ-DÍGITOS no app,
  -- então formato (+55, espaços, traços) não importa.
  telefone text not null,
  -- Rótulo nosso (ex.: "celular do João - time", "chip-semente 2").
  rotulo text,
  created_at timestamptz not null default now(),
  -- Um telefone entra uma vez por org.
  unique (organization_id, telefone)
);

create index if not exists idx_pol_cobaia_semente_org on public.pol_cobaia_semente(organization_id);

alter table public.pol_cobaia_semente enable row level security;
drop policy if exists tenant_isolation_pol_cobaia_semente_all on public.pol_cobaia_semente;
create policy tenant_isolation_pol_cobaia_semente_all on public.pol_cobaia_semente
  using (organization_id in (select public.fn_user_org_ids()));

revoke all on public.pol_cobaia_semente from anon;
grant select, insert, update, delete on public.pol_cobaia_semente to authenticated;

notify pgrst, 'reload schema';
