-- manifest: 0644 — corrige as RLS policies das 37 tabelas pol_* (War Room) para a forma "organization_id in (select public.fn_user_org_ids())". A forma anterior, "= any(public.fn_user_org_ids())", chama uma funcao set-returning dentro da policy, que o Postgres do Supabase rejeita ("set-returning functions are not allowed in policy expressions"); com isso os create policy das pol_* falhavam ao aplicar e o modulo politico ficava deny-all numa instalacao nova. Todas as demais tabelas do schema ja usam a forma "in (select ...)". Idempotente: dropa as policies antigas (read/write/all) e recria uma unica policy _all por tabela.

do $$
declare t text;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname like 'pol\_%'
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped
      )
  loop
    execute format('drop policy if exists tenant_isolation_%1$s_read on public.%1$I', t);
    execute format('drop policy if exists tenant_isolation_%1$s_write on public.%1$I', t);
    execute format('drop policy if exists tenant_isolation_%1$s_all on public.%1$I', t);
    execute format(
      'create policy tenant_isolation_%1$s_all on public.%1$I for all '
      'using (organization_id in (select public.fn_user_org_ids())) '
      'with check (organization_id in (select public.fn_user_org_ids()))', t);
  end loop;
end $$;
