-- manifest: 9002 — anexos de demanda (Gabinete/War Room): arquivos e fotos que o cidadao/assessor anexa a uma demanda (oficio, foto do problema, documento), como no sistema do concorrente. Bucket PRIVADO 'gabinete-anexos' (50MB, service_role; download so por URL assinada) + tabela pol_demanda_anexos (RLS por org) + gatilho que enfileira o arquivo na storage_redaction_queue ao apagar o anexo OU a demanda (cascata) — o worker de expurgo (lib/lgpd/storage-redaction-queue.ts) drena qualquer bucket, entao o descarte LGPD sai de graca e nenhum arquivo fica orfao. Faixa 9000+ reservada para migrations proprietarias do fork (ver docs/politico-fork-strategy.md). RLS "in (select fn_user_org_ids())" compativel com o Postgres do Supabase.

-- ── 1. bucket privado dos anexos ─────────────────────────────────────────────
-- Mesmo molde da 0055 (whatsapp-media) e da 0483 (internal-media): privado, sem
-- policy em storage.objects (acesso so por service_role — upload pela rota,
-- download por URL assinada), file_size_limit 50MB espelhando MAX_MEDIA_BYTES.
insert into storage.buckets (id, name, public, file_size_limit)
values ('gabinete-anexos', 'gabinete-anexos', false, 52428800)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

-- ── 2. tabela de anexos ──────────────────────────────────────────────────────
create table if not exists public.pol_demanda_anexos (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations(id) on delete cascade,
  demanda_id        uuid        not null references public.demandas(id) on delete cascade,
  storage_path      text        not null,
  nome_arquivo      text        not null,
  media_mime        text        not null,
  media_size_bytes  bigint      not null,
  created_by        uuid        references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);

alter table public.pol_demanda_anexos enable row level security;

drop policy if exists tenant_isolation_pol_demanda_anexos_all on public.pol_demanda_anexos;
create policy tenant_isolation_pol_demanda_anexos_all on public.pol_demanda_anexos for all
  using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));

create index if not exists pol_demanda_anexos_demanda_idx on public.pol_demanda_anexos (organization_id, demanda_id, created_at);

grant select, insert, update, delete on public.pol_demanda_anexos to authenticated;
revoke all on public.pol_demanda_anexos from anon;

-- ── 3. expurgo do arquivo: enfileira na remocao do anexo (e na cascata) ───────
-- O arquivo vive no Storage; apagar so a LINHA deixaria o binario orfao no
-- bucket para sempre. Este gatilho BEFORE DELETE coloca o caminho na
-- storage_redaction_queue (bucket 'gabinete-anexos') — a MESMA fila que o worker
-- de LGPD drena (remove de qualquer bucket). Dispara na remocao direta do anexo
-- E quando a demanda e apagada (FK on delete cascade dispara o trigger de linha).
-- SECURITY DEFINER: a fila e escrita pelo dono da funcao, nunca pelo authenticated.
create or replace function public.fn_pol_anexo_expurgo() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.storage_path is not null and length(old.storage_path) > 0 then
    insert into public.storage_redaction_queue (organization_id, bucket, object_path)
    values (old.organization_id, 'gabinete-anexos', old.storage_path)
    on conflict (bucket, object_path) do nothing;
  end if;
  return old;
end $$;

revoke all on function public.fn_pol_anexo_expurgo() from public, anon, authenticated;

drop trigger if exists trg_pol_anexo_expurgo on public.pol_demanda_anexos;
create trigger trg_pol_anexo_expurgo before delete on public.pol_demanda_anexos
  for each row execute function public.fn_pol_anexo_expurgo();

notify pgrst, 'reload schema';
