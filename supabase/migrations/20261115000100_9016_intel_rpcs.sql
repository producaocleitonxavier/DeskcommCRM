-- manifest: 9016 — Modulo Inteligencia (Pilar 1 TSE): funcoes de agregacao para o mapa de calor eleitoral. intel_mapa_municipio(eleicao, numero) devolve, por municipio (ibge_code), os votos do candidato escolhido e o total de votos validos daquele cargo/turno — o choropleth pinta a % (cand/total). intel_eleicao_candidatos(eleicao, limite) lista os candidatos de uma eleicao ordenados por votos (para o seletor). Ambas STABLE, security invoker (respeitam a RLS de leitura publica das intel_*), execute para authenticated. Aditivo, faixa 9000+ do fork.

create or replace function public.intel_mapa_municipio(p_election bigint, p_nr text)
returns table (ibge_code char(7), cand_votos int, total_votos bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select r.ibge_code,
         coalesce(sum(r.votos) filter (where r.nr_votavel = p_nr), 0)::int as cand_votos,
         sum(r.votos) as total_votos
  from public.intel_election_results r
  where r.election_id = p_election
  group by r.ibge_code;
$$;

create or replace function public.intel_eleicao_candidatos(p_election bigint, p_limit int default 100)
returns table (nr_votavel text, nm_votavel text, partido_num smallint, votos bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select r.nr_votavel, max(r.nm_votavel) as nm_votavel, max(r.partido_num) as partido_num, sum(r.votos) as votos
  from public.intel_election_results r
  where r.election_id = p_election
  group by r.nr_votavel
  order by sum(r.votos) desc
  limit greatest(p_limit, 1);
$$;

grant execute on function public.intel_mapa_municipio(bigint, text) to authenticated;
grant execute on function public.intel_eleicao_candidatos(bigint, int) to authenticated;

notify pgrst, 'reload schema';
