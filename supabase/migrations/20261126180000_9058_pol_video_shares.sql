-- manifest: 9058 — Links de vídeo rastreáveis (ALCANCE dos multiplicadores). Vídeos da biblioteca (pol_materiais tipo=video) são posts do Instagram, compartilháveis por LINK. Cada vídeo gera um link rastreável — base da org (sharer nulo) e/ou pessoal de um multiplicador. O redirect público /api/v1/vid/<id> registra o clique (dedup por visitante/dia) e manda pro post. "alcançou Y" = cliques distintos atribuídos à pessoa. Aditivo, faixa 9000+ do fork.

create table if not exists public.pol_video_shares (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  material_id uuid not null references public.pol_materiais(id) on delete cascade,
  sharer_contact_id uuid references public.contacts(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Um link por (material, compartilhador). O link BASE da org tem sharer nulo;
-- índice parcial separado porque NULL não colide em unique comum.
create unique index if not exists uq_pol_video_shares_pessoa
  on public.pol_video_shares(organization_id, material_id, sharer_contact_id)
  where sharer_contact_id is not null;
create unique index if not exists uq_pol_video_shares_base
  on public.pol_video_shares(organization_id, material_id)
  where sharer_contact_id is null;
create index if not exists idx_pol_video_shares_sharer
  on public.pol_video_shares(organization_id, sharer_contact_id)
  where sharer_contact_id is not null;

create table if not exists public.pol_video_cliques (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.pol_video_shares(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  visitor_hash text not null,
  created_at timestamptz not null default now()
);
-- Mesmo visitante, mesmo link, mesmo dia conta UMA vez (dedup honesto do alcance).
create unique index if not exists uq_pol_video_cliques_visitante
  on public.pol_video_cliques(share_id, visitor_hash);
create index if not exists idx_pol_video_cliques_org on public.pol_video_cliques(organization_id);

alter table public.pol_video_shares enable row level security;
alter table public.pol_video_cliques enable row level security;
drop policy if exists tenant_isolation_pol_video_shares_all on public.pol_video_shares;
create policy tenant_isolation_pol_video_shares_all on public.pol_video_shares
  using (organization_id in (select public.fn_user_org_ids()));
drop policy if exists tenant_isolation_pol_video_cliques_all on public.pol_video_cliques;
create policy tenant_isolation_pol_video_cliques_all on public.pol_video_cliques
  using (organization_id in (select public.fn_user_org_ids()));

revoke all on public.pol_video_shares from anon;
revoke all on public.pol_video_cliques from anon;
grant select, insert, update, delete on public.pol_video_shares to authenticated;
grant select, insert, update, delete on public.pol_video_cliques to authenticated;

-- Alcance (cliques distintos) por multiplicador. SECURITY INVOKER (respeita RLS).
create or replace function public.fn_alcance_por_contato(p_org uuid)
returns table(contact_id uuid, alcancou bigint)
language sql stable security invoker
set search_path = public
as $$
  select s.sharer_contact_id as contact_id, count(c.id) as alcancou
  from public.pol_video_shares s
  join public.pol_video_cliques c on c.share_id = s.id
  where s.organization_id = p_org and s.sharer_contact_id is not null
  group by s.sharer_contact_id;
$$;
grant execute on function public.fn_alcance_por_contato(uuid) to authenticated;

notify pgrst, 'reload schema';
