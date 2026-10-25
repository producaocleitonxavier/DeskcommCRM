-- manifest: 9048 — Máquina de envio de eventos (Fase 2C Fatia 2), DORMENTE por padrão. pol_eventos_envio_config: singleton por org com o interruptor-mestre (ativo, nasce FALSE), o canal dedicado (channel_session_id, null até conectar o número) e o fluxo de drip publicado (drip_pointer_id). pol_eventos_envio_ebook_fluxo: mapa material da Biblioteca → fluxo de boas-vindas publicado daquele ebook (qual pointer inscrever quando o evento escolheu aquele material). Nada envia enquanto ativo=false e sem canal. Aditivo, faixa 9000+ do fork.

-- Config singleton por organização: o interruptor e os ponteiros da máquina.
create table if not exists public.pol_eventos_envio_config (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  -- Interruptor-mestre. NASCE FALSE: a máquina é dormente até o gabinete conectar
  -- o número dedicado e ligar de propósito. Sem isto, o enroll no cadastro no-opa.
  ativo boolean not null default false,
  -- Sessão de canal do NÚMERO DEDICADO (channel_sessions, provider waha). null até
  -- o número existir. É o que o enroll fixa na conversa (beginServiceAtOrigin).
  channel_session_id uuid,
  -- Fluxo de drip mensal publicado (followup_flow_pointers). null até publicar.
  drip_pointer_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pol_eventos_envio_config enable row level security;
drop policy if exists tenant_isolation_pol_eventos_envio_config_all on public.pol_eventos_envio_config;
create policy tenant_isolation_pol_eventos_envio_config_all on public.pol_eventos_envio_config
  using (organization_id in (select public.fn_user_org_ids()));

revoke all on public.pol_eventos_envio_config from anon;
grant select, insert, update, delete on public.pol_eventos_envio_config to authenticated;

-- Mapa ebook → fluxo de boas-vindas: como o texto do fluxo não interpola, cada
-- material da Biblioteca tem o SEU fluxo publicado (link embutido). No cadastro,
-- o evento escolheu um material_id; aqui está qual pointer inscrever.
create table if not exists public.pol_eventos_envio_ebook_fluxo (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  material_id uuid not null references public.pol_materiais(id) on delete cascade,
  pointer_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, material_id)
);

create index if not exists idx_pol_eventos_envio_ebook_fluxo_org on public.pol_eventos_envio_ebook_fluxo(organization_id);

alter table public.pol_eventos_envio_ebook_fluxo enable row level security;
drop policy if exists tenant_isolation_pol_eventos_envio_ebook_fluxo_all on public.pol_eventos_envio_ebook_fluxo;
create policy tenant_isolation_pol_eventos_envio_ebook_fluxo_all on public.pol_eventos_envio_ebook_fluxo
  using (organization_id in (select public.fn_user_org_ids()));

revoke all on public.pol_eventos_envio_ebook_fluxo from anon;
grant select, insert, update, delete on public.pol_eventos_envio_ebook_fluxo to authenticated;

notify pgrst, 'reload schema';
