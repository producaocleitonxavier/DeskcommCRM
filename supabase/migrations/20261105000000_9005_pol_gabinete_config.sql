-- manifest: 9005 — identidade do gabinete para oficios (Gabinete/War Room): tabela pol_gabinete_config (1 linha por organizacao: nome do parlamentar, cargo, subtitulo, cidade de emissao, logo e assinatura) + bucket PRIVADO gabinete-identidade (5MB, service_role; mesmo molde da 0055/0483). Alimenta o timbre do oficio em PDF, padronizando por cliente. Aditivo, faixa 9000+ reservada para migrations proprietarias do fork (ver docs/politico-fork-strategy.md).

-- ── bucket das imagens de identidade (logo + assinatura) ──────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('gabinete-identidade', 'gabinete-identidade', false, 5242880)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

-- ── tabela de identidade (1 linha por org; PK = organization_id habilita upsert) ─
create table if not exists public.pol_gabinete_config (
  organization_id   uuid        primary key references public.organizations(id) on delete cascade,
  nome_parlamentar  text,
  cargo             text,
  subtitulo         text,
  cidade            text,
  logo_path         text,
  assinatura_path   text,
  updated_at        timestamptz not null default now()
);

alter table public.pol_gabinete_config enable row level security;

drop policy if exists tenant_isolation_pol_gabinete_config_all on public.pol_gabinete_config;
create policy tenant_isolation_pol_gabinete_config_all on public.pol_gabinete_config for all
  using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));

grant select, insert, update, delete on public.pol_gabinete_config to authenticated;
revoke all on public.pol_gabinete_config from anon;

notify pgrst, 'reload schema';
