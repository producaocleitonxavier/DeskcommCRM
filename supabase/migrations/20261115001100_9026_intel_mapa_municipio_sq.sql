-- manifest: 9026 — Modulo Inteligencia (Mapa de Votos): choropleth por SQ_CANDIDATO (correto), nao por NR_VOTAVEL. O intel_mapa_municipio por p_nr SOMAVA o numero entre candidatos diferentes (vereador/prefeito reusam numero entre municipios) → inflava (ex.: 1 vereador "em 435 municipios"). Agora intel_mapa_municipio_sq agrega intel_secao_votos por sq (unico) por municipio, com total do cargo via intel_secao_total, e devolve por ibge_code (join por tse_code). Leve: cand via indice cobridor (election,sq) include votos; total via intel_secao_total (election,cd_municipio). Aditivo, faixa 9000+. APLICADA DIRETO via pg em 2026-10-19.

create or replace function public.intel_mapa_municipio_sq(p_election bigint, p_sq bigint)
returns table (ibge_code text, cand_votos bigint, total_votos bigint)
language sql stable security invoker set search_path = public as $$
  with cand as (
    select sv.cd_municipio, sum(sv.votos)::bigint v
    from public.intel_secao_votos sv
    where sv.election_id = p_election and sv.sq_candidato = p_sq
    group by sv.cd_municipio
  ),
  tot as (
    select st.cd_municipio, sum(st.total)::bigint t
    from public.intel_secao_total st
    where st.election_id = p_election
    group by st.cd_municipio
  )
  select m.ibge_code, coalesce(c.v, 0)::bigint, t.t
  from tot t
  join public.intel_municipios m on nullif(m.tse_code, '')::int = t.cd_municipio
  left join cand c on c.cd_municipio = t.cd_municipio;
$$;

grant execute on function public.intel_mapa_municipio_sq(bigint, bigint) to authenticated;

notify pgrst, 'reload schema';
