-- manifest: 9032 — Inteligência: intel_peso_bairro — dado o candidato do mandato (election+sq) e um bairro de um município, retorna MEUS_VOTOS (votos que o parlamentar fez naquele bairro), UNIVERSO (votos do cargo no bairro) e LEADS (contatos do CRM da org no bairro). É o cruzamento "você investiu onde te elegeu?" usado nas Obras (e depois Emendas). v_ano em variável (plpgsql) p/ usar índice de intel_locais; leads via SECURITY INVOKER (respeita RLS da org). Nomes casam por upper(unaccent). Aditivo, faixa 9000+. APLICADA DIRETO via pg em 2026-10-20.

create or replace function public.intel_peso_bairro(p_election bigint, p_sq bigint, p_municipio int, p_bairro text)
returns table (meus_votos bigint, universo bigint, leads bigint)
language plpgsql stable security invoker set search_path = public set plan_cache_mode = 'force_custom_plan' as $$
declare v_ano smallint; v_bnorm text; v_cidade text;
begin
  select e.ano into v_ano from public.intel_elections e where e.id = p_election;
  v_bnorm := upper(unaccent(coalesce(p_bairro, '')));
  select upper(unaccent(nome)) into v_cidade from public.intel_municipios where tse_code = p_municipio::text;
  return query
  with secs as (
    select l.nr_zona, l.nr_secao from public.intel_locais l
    where l.ano = v_ano and l.cd_municipio = p_municipio and upper(unaccent(l.bairro)) = v_bnorm
  ),
  mv as (
    select coalesce(sum(sv.votos), 0)::bigint v
    from public.intel_secao_votos sv join secs s on s.nr_zona = sv.nr_zona and s.nr_secao = sv.nr_secao
    where sv.election_id = p_election and sv.cd_municipio = p_municipio and sv.sq_candidato = p_sq
  ),
  uni as (
    select coalesce(sum(st.total), 0)::bigint v
    from public.intel_secao_total st join secs s on s.nr_zona = st.nr_zona and s.nr_secao = st.nr_secao
    where st.election_id = p_election and st.cd_municipio = p_municipio
  ),
  lds as (
    select count(*)::bigint v
    from public.pol_leads pl join public.contacts ct on ct.id = pl.contact_id
    where upper(unaccent(ct.custom_fields->'endereco_gip'->>'bairro')) = v_bnorm
      and upper(unaccent(ct.custom_fields->'endereco_gip'->>'cidade')) = v_cidade
  )
  select (select v from mv), (select v from uni), (select v from lds);
end; $$;

grant execute on function public.intel_peso_bairro(bigint, bigint, int, text) to authenticated;

notify pgrst, 'reload schema';
