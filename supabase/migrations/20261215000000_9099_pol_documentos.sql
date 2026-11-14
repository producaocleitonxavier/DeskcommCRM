-- manifest: 9099 — pol_documentos: os documentos que o gabinete apresenta à Casa (requerimento de comissão, indicação, pedido de informação, moção) como REGISTRO PRÓPRIO, com situação, número de protocolo, prazo e PDF. Guarda a FUNÇÃO (fixa) separada do RÓTULO (o nome que cada Casa usa, livre), porque o mesmo pedido se chama indicação em Contagem e requerimento em Fortaleza. Idempotente.

create table if not exists public.pol_documentos (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null references public.organizations(id) on delete cascade,
  funcao           text        not null,
  rotulo           text        not null,
  subtipo          text,
  assunto          text        not null,
  destinatario     text,
  dispositivo      text,
  corpo            text        not null default '',
  numero           text,
  situacao         text        not null default 'rascunho',
  protocolado_em   date,
  prazo_em         date,
  demanda_id       uuid        references public.demandas(id) on delete set null,
  pdf_path         text,
  created_by       uuid        references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pol_documentos_funcao_check') then
    alter table public.pol_documentos add constraint pol_documentos_funcao_check
      check (funcao in ('pedido_comissao', 'providencia', 'informacao', 'manifestacao'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pol_documentos_situacao_check') then
    alter table public.pol_documentos add constraint pol_documentos_situacao_check
      check (situacao in ('rascunho', 'protocolado', 'aprovado', 'realizado', 'respondido', 'arquivado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pol_documentos_pdf_path_da_org') then
    alter table public.pol_documentos add constraint pol_documentos_pdf_path_da_org
      check (pdf_path is null or pdf_path like organization_id::text || '/%');
  end if;
end $$;
alter table public.pol_documentos enable row level security;
drop policy if exists tenant_isolation_pol_documentos_all on public.pol_documentos;
create policy tenant_isolation_pol_documentos_all on public.pol_documentos for all
  using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));
create index if not exists pol_documentos_org_idx on public.pol_documentos (organization_id, updated_at desc);
create index if not exists pol_documentos_demanda_idx on public.pol_documentos (organization_id, demanda_id) where demanda_id is not null;
grant select, insert, update, delete on public.pol_documentos to authenticated;
revoke all on public.pol_documentos from anon;

-- Apagar o documento manda o PDF para a fila de expurgo (mesma régua dos anexos da demanda).
create or replace function public.fn_pol_documento_expurgo() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Só enfileira enquanto a organização existe: quando é a própria organização que está sendo
  -- apagada (cascata), a fila aponta para ela por chave estrangeira e a inserção derrubaria o delete.
  if old.pdf_path is not null and length(old.pdf_path) > 0
     and exists (select 1 from public.organizations o where o.id = old.organization_id) then
    begin
      insert into public.storage_redaction_queue (organization_id, bucket, object_path)
      values (old.organization_id, 'gabinete-anexos', old.pdf_path)
      on conflict (bucket, object_path) do nothing;
    exception when foreign_key_violation then
      null; -- a organização saiu no meio da cascata: não há a quem atribuir o expurgo
    end;
  end if;
  return old;
end $$;
revoke all on function public.fn_pol_documento_expurgo() from public, anon, authenticated;
drop trigger if exists trg_pol_documento_expurgo on public.pol_documentos;
create trigger trg_pol_documento_expurgo before delete on public.pol_documentos
  for each row execute function public.fn_pol_documento_expurgo();

notify pgrst, 'reload schema';
