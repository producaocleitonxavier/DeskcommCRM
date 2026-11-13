-- manifest: 9097 — auditoria de segurança de 13/nov: (1) as views pol_vw_* passam a respeitar a RLS de quem consulta (security_invoker) e deixam de responder à chave anônima — 8 delas devolviam agregados de TODAS as organizações sem login; (2) o caminho de arquivo guardado em pol_demanda_anexos, pol_obra_fotos, pol_liderancas, pol_gabinete_config, messages, contacts (foto) e conversation_notes tem de começar com o id da própria organização (a coluna é gravável por membro e a chave de serviço assinava o arquivo de outro gabinete). Idempotente; as travas de caminho nascem NOT VALID (valem para toda gravação nova, não reprovam linha antiga).

-- (1) views do módulo político: RLS de quem consulta + sem chave anônima
do $$
declare v text;
begin
  for v in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v' and c.relname like 'pol\_vw\_%'
  loop
    execute format('alter view public.%I set (security_invoker = true)', v);
    execute format('revoke all on public.%I from anon', v);
    execute format('revoke all on public.%I from public', v);
    execute format('grant select on public.%I to authenticated', v);
    execute format('grant select on public.%I to service_role', v);
  end loop;
end $$;

-- (2) caminho de arquivo preso à organização da linha
do $$
declare
  alvo record;
  nome text;
begin
  for alvo in
    select * from (values
      ('pol_demanda_anexos', 'storage_path'),
      ('pol_obra_fotos', 'storage_path'),
      ('pol_liderancas', 'foto_path'),
      ('pol_gabinete_config', 'logo_path'),
      ('pol_gabinete_config', 'assinatura_path'),
      ('pol_gabinete_config', 'timbrado_path'),
      ('pol_gabinete_config', 'moldura_vitoria_path'),
      ('messages', 'media_storage_path'),
      ('contacts', 'avatar_storage_path'),
      ('conversation_notes', 'media_storage_path')
    ) as t(tabela, coluna)
  loop
    -- tabela/coluna podem não existir numa instalação mais antiga: pula.
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = alvo.tabela and column_name = alvo.coluna
    ) then
      continue;
    end if;
    nome := alvo.tabela || '_' || alvo.coluna || '_da_org';
    if exists (
      select 1 from pg_constraint
       where conname = nome and conrelid = format('public.%I', alvo.tabela)::regclass
    ) then
      continue;
    end if;
    execute format(
      'alter table public.%I add constraint %I check (%I is null or (%I like organization_id::text || ''/%%'' and strpos(%I, chr(92)) = 0)) not valid',
      alvo.tabela, nome, alvo.coluna, alvo.coluna, alvo.coluna
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
