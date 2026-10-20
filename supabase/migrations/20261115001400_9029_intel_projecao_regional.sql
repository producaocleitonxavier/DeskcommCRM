-- manifest: 9029 — Modulo Inteligencia (Projecao POR REGIONAL): intel_universo_regional + intel_regional_leads. A Projeção so falava em zona (18)/bairro (200); regional (9 em BH, 8 em Contagem) e o recorte que o politico entende. Usa intel_bairro_regional (9028). universo_regional: soma intel_secao_total por bairro->regional (plpgsql v_ano p/ usar indice de intel_locais — ver licao 9027). regional_leads: cruza contacts endereco_gip.bairro->regional (espelha intel_zona_leads, SECURITY INVOKER = respeita RLS da org). So retorna dados p/ cidades com o mapa (BH/Contagem); outras ficam so na visao zona. Aditivo, faixa 9000+. APLICADA DIRETO via pg em 2026-10-20.

create or replace function public.intel_universo_regional(p_election bigint, p_municipio int)
returns table (regional text, universo bigint, bairros text[])
language plpgsql stable security invoker set search_path = public set plan_cache_mode = 'force_custom_plan' as $$
declare v_ano smallint;
begin
  select e.ano into v_ano from public.intel_elections e where e.id = p_election;
  return query
  with sec as (
    select l.bairro, st.total
    from public.intel_secao_total st
    join public.intel_locais l on l.ano = v_ano and l.cd_municipio = st.cd_municipio and l.nr_zona = st.nr_zona and l.nr_secao = st.nr_secao
    where st.election_id = p_election and st.cd_municipio = p_municipio
  )
  select br.regional, sum(sec.total)::bigint, array_agg(distinct sec.bairro)
  from sec join public.intel_bairro_regional br on br.cd_municipio = p_municipio and br.bairro = sec.bairro
  group by br.regional
  order by sum(sec.total) desc;
end; $$;

create or replace function public.intel_regional_leads(p_municipio int, p_ano int)
returns table (regional text, leads bigint)
language sql stable security invoker set search_path = public as $$
  with br as (select upper(unaccent(bairro)) bnorm, min(regional) regional from public.intel_bairro_regional where cd_municipio = p_municipio group by upper(unaccent(bairro))),
  mun as (select upper(unaccent(nome)) nom from public.intel_municipios where tse_code = p_municipio::text),
  leads as (
    select upper(unaccent(ct.custom_fields->'endereco_gip'->>'bairro')) bnorm
    from public.pol_leads pl join public.contacts ct on ct.id = pl.contact_id, mun
    where upper(unaccent(ct.custom_fields->'endereco_gip'->>'cidade')) = mun.nom and ct.custom_fields->'endereco_gip'->>'bairro' is not null
  )
  select br.regional, count(*)::bigint from leads join br on br.bnorm = leads.bnorm group by br.regional;
$$;

grant execute on function public.intel_universo_regional(bigint, int) to authenticated;
grant execute on function public.intel_regional_leads(int, int) to authenticated;

notify pgrst, 'reload schema';
