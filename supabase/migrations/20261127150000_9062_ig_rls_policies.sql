-- manifest: 9062 — RLS das tabelas do Instagram (ig_automation_flows, ig_comment_events, ig_webhook_tokens): tinham RLS LIGADO mas ZERO policies = deny-all pra sessão. Resultado: o hub do Instagram (que lê por sessão) mostrava tudo 0 (flows ativos, DMs, tokens) mesmo existindo dados; só as rotas via admin viam. Mesma classe do fix das pol_* (0644). Adiciona isolamento por organização (fn_user_org_ids). Aditivo, faixa 9000+ do fork.

do $$
declare t text;
begin
  foreach t in array array['ig_automation_flows','ig_comment_events','ig_webhook_tokens']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation_%I_all on public.%I', t, t);
    execute format(
      'create policy tenant_isolation_%I_all on public.%I using (organization_id in (select public.fn_user_org_ids())) with check (organization_id in (select public.fn_user_org_ids()))',
      t, t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
