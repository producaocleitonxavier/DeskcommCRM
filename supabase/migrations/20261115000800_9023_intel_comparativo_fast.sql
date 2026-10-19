-- manifest: 9023 — Modulo Inteligencia (Arena Comparativa): PERFORMANCE (so zona funcionava; bairro/local/secao e 3+ candidatos travavam/timeout em municipio grande). Tres causas: (1) o comparativo varria TODOS os candidatos do municipio p/ o universo -> agora usa intel_secao_total (total por secao PRE-COMPUTADO, populado pelo import). (2) os votos dos comparados escaneiam so WHERE sq = any(selecionados) (indice cobridor). (3) o universo vinha de um SUBQUERY CORRELACIONADO (1x por linha de saida -> 36s em 9k secoes) -> agora e um JOIN (1x). Resultado em BH, 5 candidatos: bairro 1.0s, local 0.5s, secao 0.4s, zona 0.3s. intel_secao_total REFRESH apos import: insert select election_id, cd_municipio, nr_zona, nr_secao, sum(votos) from intel_secao_votos group by 1,2,3,4. Corretivo, faixa 9000+. APLICADA DIRETO via pg em 2026-10-19.

-- Total de votos por secao (todos os candidatos), pre-computado. Populado pelo import.
create table if not exists public.intel_secao_total (
  election_id  bigint   not null,
  cd_municipio int      not null,
  nr_zona      smallint not null,
  nr_secao     smallint not null,
  total        int      not null default 0
);
create index if not exists intel_secao_total_mun on public.intel_secao_total (election_id, cd_municipio);
alter table public.intel_secao_total enable row level security;
drop policy if exists intel_secao_total_read on public.intel_secao_total;
create policy intel_secao_total_read on public.intel_secao_total for select to authenticated using (true);
grant select on public.intel_secao_total to authenticated;
revoke all on public.intel_secao_total from anon;

-- Comparativo: votos dos selecionados + universo (via intel_secao_total) por dimensao. JOIN (nao subquery correlacionado).
create or replace function public.intel_comparativo(p_election bigint, p_municipio int, p_dim text, p_sqs bigint[])
returns table (chave text, rotulo text, sq_candidato bigint, votos bigint, universo bigint)
language plpgsql stable security invoker set search_path = public as $$
declare v_ano smallint;
begin
  select e.ano into v_ano from public.intel_elections e where e.id = p_election;
  return query
  with locais as (
    select l.nr_zona, l.nr_secao, l.bairro, l.local_nome from public.intel_locais l where l.ano = v_ano and l.cd_municipio = p_municipio
  ),
  sel as (
    select sv.sq_candidato as sqc, sv.nr_zona, sv.nr_secao, sv.votos
    from public.intel_secao_votos sv
    where sv.election_id = p_election and sv.cd_municipio = p_municipio and sv.sq_candidato = any(p_sqs)
  ),
  sectot as (
    select st.nr_zona, st.nr_secao, st.total from public.intel_secao_total st
    where st.election_id = p_election and st.cd_municipio = p_municipio
  ),
  ks as (
    select
      case p_dim when 'zona' then s.nr_zona::text when 'bairro' then coalesce(l.bairro,'Sem bairro') when 'local' then coalesce(l.local_nome,'Local '||s.nr_zona||'/'||s.nr_secao) else s.nr_zona::text||'-'||s.nr_secao::text end as chave,
      case p_dim when 'zona' then 'Zona '||s.nr_zona::text when 'bairro' then coalesce(l.bairro,'Sem bairro') when 'local' then coalesce(l.local_nome,'Local sem nome') else 'Zona '||s.nr_zona::text||' · Seção '||s.nr_secao::text end as rotulo,
      s.sqc, s.votos
    from sel s left join locais l on l.nr_zona = s.nr_zona and l.nr_secao = s.nr_secao
  ),
  kt as (
    select
      case p_dim when 'zona' then st.nr_zona::text when 'bairro' then coalesce(l.bairro,'Sem bairro') when 'local' then coalesce(l.local_nome,'Local '||st.nr_zona||'/'||st.nr_secao) else st.nr_zona::text||'-'||st.nr_secao::text end as chave,
      st.total
    from sectot st left join locais l on l.nr_zona = st.nr_zona and l.nr_secao = st.nr_secao
  ),
  uni as (select kt.chave, sum(kt.total)::bigint as total from kt group by kt.chave)
  select ks.chave, max(ks.rotulo), ks.sqc, sum(ks.votos)::bigint, max(uni.total)
  from ks join uni on uni.chave = ks.chave
  group by ks.chave, ks.sqc;
end; $$;

grant execute on function public.intel_comparativo(bigint, int, text, bigint[]) to authenticated;

notify pgrst, 'reload schema';
