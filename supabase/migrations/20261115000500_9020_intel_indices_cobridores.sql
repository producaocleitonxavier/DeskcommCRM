-- manifest: 9020 — Modulo Inteligencia (Raio-X): INDICES COBRIDORES + fix do comparativo. Num compute pequeno, a varredura de indice comum ainda buscava votos no HEAP (I/O), e as agregacoes (ranking por municipio, drill, comparativo) estouravam o statement_timeout. Esta migration troca os indices de intel_secao_votos e intel_election_results por versoes COBRIDORAS (INCLUDE votos) -> as agregacoes viram index-only scan (sem heap), sub-segundo. Tambem corrige intel_comparativo (coluna sq_candidato ambigua entre a coluna da tabela e o OUT param). Idempotente. Aditivo/corretivo, faixa 9000+ do fork. APLICADA DIRETO NO BANCO em 2026-10-19; este arquivo e o registro p/ baseline/novas instalacoes.

-- Indices cobridores em intel_secao_votos (substituem os nao-cobridores da 9017)
drop index if exists public.intel_secao_mun_idx;
drop index if exists public.intel_secao_cand_idx;
create index if not exists intel_secao_mun_cover
  on public.intel_secao_votos (election_id, cd_municipio, sq_candidato, nr_zona, nr_secao) include (votos);
create index if not exists intel_secao_cand_cover
  on public.intel_secao_votos (election_id, sq_candidato, cd_municipio, nr_zona, nr_secao) include (votos);

-- Indice cobridor em intel_election_results (substitui o tse plano da 9019)
drop index if exists public.intel_results_election_tse_idx;
create index if not exists intel_results_tse_cover
  on public.intel_election_results (election_id, tse_code) include (votos);

-- intel_comparativo: qualifica sq_candidato/votos (eram ambiguos com os OUT params)
create or replace function public.intel_comparativo(p_election bigint, p_municipio int, p_dim text, p_sqs bigint[])
returns table (chave text, rotulo text, sq_candidato bigint, votos bigint, universo bigint)
language plpgsql stable security invoker set search_path = public as $$
declare v_ano smallint;
begin
  select e.ano into v_ano from public.intel_elections e where e.id = p_election;
  return query
  with base as (
    select sv.nr_zona, sv.nr_secao, sv.sq_candidato as sqc, sv.votos as vt, l.bairro, l.local_nome
    from public.intel_secao_votos sv
    left join public.intel_locais l on l.ano = v_ano and l.cd_municipio = sv.cd_municipio and l.nr_zona = sv.nr_zona and l.nr_secao = sv.nr_secao
    where sv.election_id = p_election and sv.cd_municipio = p_municipio
  ),
  keyed as (
    select
      case p_dim when 'zona' then base.nr_zona::text when 'bairro' then coalesce(base.bairro,'Sem bairro') when 'local' then coalesce(base.local_nome,'Local '||base.nr_zona||'/'||base.nr_secao) else base.nr_zona::text||'-'||base.nr_secao::text end as chv,
      case p_dim when 'zona' then 'Zona '||base.nr_zona::text when 'bairro' then coalesce(base.bairro,'Sem bairro') when 'local' then coalesce(base.local_nome,'Local sem nome') else 'Zona '||base.nr_zona::text||' · Seção '||base.nr_secao::text end as rot,
      base.sqc, base.vt
    from base
  ),
  uni as (select k.chv, sum(k.vt) as total from keyed k group by k.chv)
  select k.chv, max(k.rot), k.sqc, sum(k.vt)::bigint, (select u.total from uni u where u.chv = k.chv)
  from keyed k where k.sqc = any(p_sqs) group by k.chv, k.sqc;
end; $$;

grant execute on function public.intel_comparativo(bigint, int, text, bigint[]) to authenticated;

notify pgrst, 'reload schema';
