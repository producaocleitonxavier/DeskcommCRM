-- manifest: 9019 — Modulo Inteligencia (Raio-X): CORRECAO de performance do drill por municipio. Para candidatos "grandes" (deputado com dezenas de milhares de secoes espalhadas por centenas de municipios) o intel_cand_drill estourava statement_timeout: a ramificacao 'municipio' usava um SUBQUERY CORRELACIONADO para o universo (rodava 1x por municipio, 850+ vezes) e faltava indice por tse_code em intel_election_results. Esta migration (1) cria o indice (election_id, tse_code) e (2) reescreve intel_cand_drill trocando o subquery correlacionado por CTEs com JOIN (uma passada so). Aditivo/corretivo, faixa 9000+ do fork.

create index if not exists intel_results_election_tse_idx on public.intel_election_results (election_id, tse_code);

create or replace function public.intel_cand_drill(p_election bigint, p_sq bigint, p_dim text, p_municipio int default null)
returns table (chave text, rotulo text, votos bigint, universo bigint)
language plpgsql stable security invoker set search_path = public as $$
declare v_ano smallint;
begin
  select e.ano into v_ano from public.intel_elections e where e.id = p_election;

  if p_dim = 'municipio' then
    return query
    with cand as (
      select sv.cd_municipio, sum(sv.votos)::bigint as votos
      from public.intel_secao_votos sv
      where sv.election_id = p_election and sv.sq_candidato = p_sq
      group by sv.cd_municipio
    ),
    tot as (
      select r.tse_code, sum(r.votos)::bigint as total
      from public.intel_election_results r
      where r.election_id = p_election
      group by r.tse_code
    )
    select c.cd_municipio::text,
           coalesce(m.nome, c.cd_municipio::text),
           c.votos,
           coalesce(t.total, 0)::bigint
    from cand c
    left join public.intel_municipios m on m.tse_code = c.cd_municipio::text
    left join tot t on t.tse_code = c.cd_municipio::text
    order by c.votos desc;
  else
    return query
    with uni as (
      select coalesce(sum(r.votos), 0)::bigint as total
      from public.intel_election_results r
      where r.election_id = p_election and r.tse_code = p_municipio::text
    ),
    base as (
      select sv.nr_zona, sv.nr_secao, sv.votos, l.bairro, l.local_nome
      from public.intel_secao_votos sv
      left join public.intel_locais l
        on l.ano = v_ano and l.cd_municipio = sv.cd_municipio and l.nr_zona = sv.nr_zona and l.nr_secao = sv.nr_secao
      where sv.election_id = p_election and sv.sq_candidato = p_sq and sv.cd_municipio = p_municipio
    )
    select
      case p_dim when 'zona' then b.nr_zona::text when 'bairro' then coalesce(b.bairro,'Sem bairro') when 'local' then coalesce(b.local_nome,'Local '||b.nr_zona||'/'||b.nr_secao) else b.nr_zona::text||'-'||b.nr_secao::text end,
      case p_dim when 'zona' then 'Zona '||b.nr_zona::text when 'bairro' then coalesce(b.bairro,'Sem bairro') when 'local' then coalesce(b.local_nome,'Local sem nome') else 'Zona '||b.nr_zona::text||' · Seção '||b.nr_secao::text end,
      sum(b.votos)::bigint, (select total from uni)
    from base b
    group by 1, 2
    order by sum(b.votos) desc;
  end if;
end; $$;

notify pgrst, 'reload schema';
