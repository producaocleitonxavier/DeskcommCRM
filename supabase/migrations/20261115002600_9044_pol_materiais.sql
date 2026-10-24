-- manifest: 9044 — Biblioteca de Materiais (pol_materiais): e-books, PDFs, vídeos e links de campanha com capa, categoria livre, descrição e URL externa, por organização. É o banco de conteúdos que alimenta o nurture (palestras/captação) e o envio de materiais. Aditivo, faixa 9000+ do fork.

create table if not exists public.pol_materiais (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  titulo text not null,
  descricao text,
  categoria text,
  tipo text not null default 'ebook' check (tipo in ('ebook','pdf','video','audio','link','imagem','outro')),
  url text not null,
  capa_url text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pol_materiais_org on public.pol_materiais(organization_id);
create index if not exists idx_pol_materiais_ativo on public.pol_materiais(organization_id, ativo);

alter table public.pol_materiais enable row level security;
drop policy if exists tenant_isolation_pol_materiais_all on public.pol_materiais;
create policy tenant_isolation_pol_materiais_all on public.pol_materiais
  using (organization_id in (select public.fn_user_org_ids()));

revoke all on public.pol_materiais from anon;
grant select, insert, update, delete on public.pol_materiais to authenticated;

notify pgrst, 'reload schema';
