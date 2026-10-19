-- manifest: 9024 — Modulo Inteligencia (Arena Comparativa): RECORTE por regiao. Em municipio grande, as dimensoes Local (centenas de escolas) e Secao (milhares) vinham com a cidade inteira espalhada, impossivel de analisar. Agora intel_comparativo aceita p_zona e p_bairro (opcionais) que filtram as linhas das dimensoes Local/Secao (ex.: "secoes da Zona 332" ou "escolas do bairro MILIONARIOS"). O universo (total por secao) nao muda — so some as linhas fora do recorte, entao o % de cada local/secao continua correto. Como adiciona parametros (muda a assinatura), e preciso DROP+CREATE (nao da p/ create or replace). Novo intel_recortes_municipio lista as zonas e bairros disponiveis do municipio p/ popular os seletores. Aditivo/corretivo, faixa 9000+. APLICADA DIRETO via pg em 2026-10-19.

-- Assinatura nova (6 args): DROP do 4-args antigo antes (nao da p/ so "create or replace" ao mudar args).
drop function if exists public.intel_comparativo(bigint, int, text, bigint[]);

create function public.intel_comparativo(
  p_election bigint, p_municipio int, p_dim text, p_sqs bigint[],
  p_zona int default null, p_bairro text default null
)
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
    where (p_zona is null or s.nr_zona = p_zona)
      and (p_bairro is null or l.bairro = p_bairro)
  ),
  kt as (
    select
      case p_dim when 'zona' then st.nr_zona::text when 'bairro' then coalesce(l.bairro,'Sem bairro') when 'local' then coalesce(l.local_nome,'Local '||st.nr_zona||'/'||st.nr_secao) else st.nr_zona::text||'-'||st.nr_secao::text end as chave,
      st.total
    from sectot st left join locais l on l.nr_zona = st.nr_zona and l.nr_secao = st.nr_secao
    where (p_zona is null or st.nr_zona = p_zona)
      and (p_bairro is null or l.bairro = p_bairro)
  ),
  uni as (select kt.chave, sum(kt.total)::bigint as total from kt group by kt.chave)
  select ks.chave, max(ks.rotulo), ks.sqc, sum(ks.votos)::bigint, max(uni.total)
  from ks join uni on uni.chave = ks.chave
  group by ks.chave, ks.sqc;
end; $$;

grant execute on function public.intel_comparativo(bigint, int, text, bigint[], int, text) to authenticated;

-- Zonas e bairros disponiveis de um municipio (p/ popular os seletores de recorte).
create or replace function public.intel_recortes_municipio(p_election bigint, p_municipio int)
returns table (tipo text, valor text)
language sql stable security invoker set search_path = public as $$
  with e as (select ano from public.intel_elections where id = p_election)
  select 'zona'::text, z.nr_zona::text from (
    select distinct l.nr_zona from public.intel_locais l join e on true
    where l.ano = e.ano and l.cd_municipio = p_municipio and l.nr_zona is not null
  ) z
  union all
  select 'bairro'::text, b.bairro from (
    select distinct l.bairro from public.intel_locais l join e on true
    where l.ano = e.ano and l.cd_municipio = p_municipio and l.bairro is not null and l.bairro <> ''
  ) b;
$$;

grant execute on function public.intel_recortes_municipio(bigint, int) to authenticated;

notify pgrst, 'reload schema';
