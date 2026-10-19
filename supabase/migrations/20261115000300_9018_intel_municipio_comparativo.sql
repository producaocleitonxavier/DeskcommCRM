-- manifest: 9018 — Modulo Inteligencia (Raio-X): filtro por MUNICIPIO e ARENA COMPARATIVA. intel_cand_ranking_mun(eleicao, municipio, q, limite, offset) ranqueia candidatos pelos votos DENTRO de um municipio (agrega a secao escopada pelo indice election+municipio — rapido; serve vereador/prefeito e tambem "como cada candidato foi naquele municipio"). intel_comparativo(eleicao, municipio, dim, sqs[]) devolve, por localidade (zona/bairro/local/secao), os votos de cada candidato selecionado + o universo da localidade (p/ % e posicao). Ambas STABLE, security invoker, execute p/ authenticated. Sem mudanca de schema. Aditivo, faixa 9000+ do fork.

-- Ranking de candidatos dentro de um municipio (por votos no municipio).
create or replace function public.intel_cand_ranking_mun(p_election bigint, p_municipio int, p_q text default null, p_limit int default 50, p_offset int default 0)
returns table (sq_candidato bigint, nr_votavel text, nome_urna text, nome text, partido_sigla text, situacao text, votos_total int, posicao bigint)
language sql stable security invoker set search_path = public as $$
  with m as (
    select sv.sq_candidato, sum(sv.votos)::int as votos
    from public.intel_secao_votos sv
    where sv.election_id = p_election and sv.cd_municipio = p_municipio
    group by sv.sq_candidato
  )
  select c.sq_candidato, c.nr_votavel, c.nome_urna, c.nome, c.partido_sigla, c.situacao, m.votos,
         row_number() over (order by m.votos desc) as posicao
  from m join public.intel_candidatos c on c.election_id = p_election and c.sq_candidato = m.sq_candidato
  where (p_q is null or p_q = '' or c.nome_urna ilike '%'||p_q||'%' or c.nome ilike '%'||p_q||'%' or c.nr_votavel = p_q)
  order by m.votos desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

-- Comparativo: por localidade (dim) de um municipio, votos de cada candidato
-- selecionado + universo (total de votos validos da localidade).
create or replace function public.intel_comparativo(p_election bigint, p_municipio int, p_dim text, p_sqs bigint[])
returns table (chave text, rotulo text, sq_candidato bigint, votos bigint, universo bigint)
language plpgsql stable security invoker set search_path = public as $$
declare v_ano smallint;
begin
  select e.ano into v_ano from public.intel_elections e where e.id = p_election;
  return query
  with base as (
    select sv.nr_zona, sv.nr_secao, sv.sq_candidato, sv.votos, l.bairro, l.local_nome
    from public.intel_secao_votos sv
    left join public.intel_locais l
      on l.ano = v_ano and l.cd_municipio = sv.cd_municipio and l.nr_zona = sv.nr_zona and l.nr_secao = sv.nr_secao
    where sv.election_id = p_election and sv.cd_municipio = p_municipio
  ),
  keyed as (
    select
      case p_dim when 'zona' then nr_zona::text when 'bairro' then coalesce(bairro,'Sem bairro') when 'local' then coalesce(local_nome,'Local '||nr_zona||'/'||nr_secao) else nr_zona::text||'-'||nr_secao::text end as chave,
      case p_dim when 'zona' then 'Zona '||nr_zona::text when 'bairro' then coalesce(bairro,'Sem bairro') when 'local' then coalesce(local_nome,'Local sem nome') else 'Zona '||nr_zona::text||' · Seção '||nr_secao::text end as rotulo,
      sq_candidato, votos
    from base
  ),
  uni as (select k.chave, sum(k.votos) as total from keyed k group by k.chave)
  select k.chave, max(k.rotulo), k.sq_candidato, sum(k.votos)::bigint, (select u.total from uni u where u.chave = k.chave)
  from keyed k
  where k.sq_candidato = any(p_sqs)
  group by k.chave, k.sq_candidato;
end; $$;

-- Total de votos validos do cargo num municipio (p/ a % no modo municipio).
create or replace function public.intel_total_municipio(p_election bigint, p_municipio int)
returns bigint language sql stable security invoker set search_path = public as $$
  select coalesce(sum(votos), 0)::bigint from public.intel_election_results
  where election_id = p_election and tse_code = p_municipio::text;
$$;

grant execute on function public.intel_cand_ranking_mun(bigint, int, text, int, int) to authenticated;
grant execute on function public.intel_comparativo(bigint, int, text, bigint[]) to authenticated;
grant execute on function public.intel_total_municipio(bigint, int) to authenticated;

notify pgrst, 'reload schema';
