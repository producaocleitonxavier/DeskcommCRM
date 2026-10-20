-- manifest: 9025 — Modulo Inteligencia (Projecao VIVA): base da fusao Mapa Eleitoral + Projecao. A Projecao antiga roda sobre pol_tse_data (tabela TSE legada, vazia nesta instalacao) e nao usa o dado vivo intel_*. Esta RPC da o UNIVERSO eleitoral por zona do dado vivo: soma os votos do cargo por zona (de intel_secao_total, ja agregado/indexado por election+municipio) + os bairros da zona (de intel_locais). O cruzamento com os leads do CRM (penetracao, projecao) e feito reusando intel_zona_leads (9021) na server action — aqui nao se toca em contacts. Leve: index scan por municipio + group by zona (poucos milhares de linhas). Aditivo, faixa 9000+. APLICADA DIRETO via pg em 2026-10-19.

create or replace function public.intel_universo_zona(p_election bigint, p_municipio int)
returns table (nr_zona smallint, universo bigint, bairros text[])
language sql stable security invoker set search_path = public as $$
  with e as (select ano from public.intel_elections where id = p_election),
  u as (
    select st.nr_zona, sum(st.total)::bigint as universo
    from public.intel_secao_total st
    where st.election_id = p_election and st.cd_municipio = p_municipio
    group by st.nr_zona
  ),
  b as (
    select l.nr_zona, array_agg(distinct l.bairro order by l.bairro) filter (where l.bairro is not null and l.bairro <> '') as bairros
    from public.intel_locais l join e on true
    where l.ano = e.ano and l.cd_municipio = p_municipio
    group by l.nr_zona
  )
  select u.nr_zona, u.universo, coalesce(b.bairros, '{}'::text[])
  from u left join b on b.nr_zona = u.nr_zona
  order by u.universo desc;
$$;

grant execute on function public.intel_universo_zona(bigint, int) to authenticated;

notify pgrst, 'reload schema';
