-- manifest: 9080 — Grupos de origem (camaleão). As ORIGENS de contato (contacts.source,
-- vocabulário aberto) viram uma lista plana enorme quando o mandato faz dezenas de
-- eventos/palestras. Aqui o cliente ORGANIZA essas origens em GRUPOS do SEU mandato —
-- Cleiton agrupa "Palestras/Abaixo-assinado"; Tramonte agrupa "Emendas-Escolas/Formaturas".
-- Mesma engine, skins diferentes. Origem sem grupo cai em "A classificar" (view calcula no app).
-- Aditivo, faixa 9000+ do fork.

-- ─── pol_origem_grupos: os grupos que o cliente define ───────────────────────
create table if not exists public.pol_origem_grupos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Nome do grupo, do jeito do mandato ("Palestras", "Emendas-Escolas", "Formaturas").
  nome text not null,
  -- Ordem de exibição no seletor/tela (menor primeiro).
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_pol_origem_grupos_org on public.pol_origem_grupos(organization_id);

alter table public.pol_origem_grupos enable row level security;
drop policy if exists tenant_isolation_pol_origem_grupos_all on public.pol_origem_grupos;
create policy tenant_isolation_pol_origem_grupos_all on public.pol_origem_grupos
  using (organization_id in (select public.fn_user_org_ids()));

revoke all on public.pol_origem_grupos from anon;
grant select, insert, update, delete on public.pol_origem_grupos to authenticated;

-- ─── pol_origem_mapeamento: cada origem (source) → um grupo ──────────────────
-- Uma origem pertence a NO MÁXIMO um grupo por organização (a ausência de linha =
-- "A classificar"). apagar o grupo solta as origens de volta (cascade).
create table if not exists public.pol_origem_mapeamento (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- O valor cru de contacts.source (ex.: "saga_palestras", "QR · Praça 7").
  source text not null,
  grupo_id uuid not null references public.pol_origem_grupos(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Uma origem só cai num grupo por org: a chave que o upsert casa.
  unique (organization_id, source)
);

create index if not exists idx_pol_origem_map_org on public.pol_origem_mapeamento(organization_id);
create index if not exists idx_pol_origem_map_grupo on public.pol_origem_mapeamento(grupo_id);

alter table public.pol_origem_mapeamento enable row level security;
drop policy if exists tenant_isolation_pol_origem_mapeamento_all on public.pol_origem_mapeamento;
create policy tenant_isolation_pol_origem_mapeamento_all on public.pol_origem_mapeamento
  using (organization_id in (select public.fn_user_org_ids()));

revoke all on public.pol_origem_mapeamento from anon;
grant select, insert, update, delete on public.pol_origem_mapeamento to authenticated;

-- ─── pol_vw_origens: as origens distintas da base, com contagem ──────────────
-- security_invoker = respeita a RLS de contacts (cada um vê só a sua org).
create or replace view public.pol_vw_origens
  with (security_invoker = true)
  as
  select
    organization_id,
    source,
    count(*)::bigint as total
  from public.contacts
  where source is not null and length(trim(source)) > 0
  group by organization_id, source;

grant select on public.pol_vw_origens to authenticated;

notify pgrst, 'reload schema';
