-- manifest: 9059 — pol_carimbar_cidade_leads(org): RELIGA pol_leads.territory_id à cidade do contato. A cidade vive em custom_fields (endereco_gip|endereco|flat) e as cidades em pol_territories(type=cidade), mas a re-importação da base zerou o LINK (territory_id) — o filtro de Cidade e o mapa de calor (que leem via territory_id) ficaram em 0 mesmo com a cidade presente. Esta função casa o NOME da cidade (com a UF, quando houver) e preenche territory_id. Set-based, idempotente (só onde territory_id é nulo). Espelha pol_carimbar_zonas_leads (9050). Rodar após cada importação. Aditivo, faixa 9000+ do fork.

create or replace function public.pol_carimbar_cidade_leads(p_org uuid)
returns integer
language plpgsql
security invoker
as $$
declare
  v_count integer;
begin
  with base as (
    select
      pl.id as lead_id,
      coalesce(c.custom_fields->'endereco_gip'->>'cidade', c.custom_fields->'endereco'->>'cidade', c.custom_fields->>'cidade') as cidade,
      coalesce(c.custom_fields->'endereco_gip'->>'estado', c.custom_fields->'endereco'->>'estado', c.custom_fields->>'uf', c.custom_fields->>'estado') as uf
    from public.pol_leads pl
    join public.contacts c on c.id = pl.contact_id
    where pl.organization_id = p_org
      and pl.territory_id is null
  ),
  upd as (
    update public.pol_leads pl
    set territory_id = t.id
    from base b
    join public.pol_territories t
      on t.organization_id = p_org
      and t.type = 'cidade'
      and lower(btrim(t.name)) = lower(btrim(b.cidade))
      -- Desempata homônimo por UF quando ambos a têm (ex.: Santa Luzia).
      and (t.state_code is null or b.uf is null or upper(btrim(t.state_code)) = upper(btrim(b.uf)))
    where pl.id = b.lead_id
      and b.cidade is not null
      and btrim(b.cidade) <> ''
    returning pl.id
  )
  select count(*) into v_count from upd;
  return v_count;
end;
$$;

revoke all on function public.pol_carimbar_cidade_leads(uuid) from anon;
grant execute on function public.pol_carimbar_cidade_leads(uuid) to authenticated;

notify pgrst, 'reload schema';
