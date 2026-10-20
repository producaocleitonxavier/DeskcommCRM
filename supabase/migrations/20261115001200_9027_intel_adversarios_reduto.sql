-- manifest: 9027 — Modulo Inteligencia (Dossie "raio-x da batalha"): intel_adversarios_reduto. A partir dos REDUTOS do candidato (os p_nbairros bairros onde ele mais fez voto no municipio), descobre quais dos candidatos mais fortes do municipio (top 40 de intel_cand_mun) mais disputam ESSE territorio (somam mais votos nas mesmas secoes), fora o proprio. Devolve sq, nome_urna, partido, votos no reduto e votos totais no municipio. PERF: o ano DEVE vir de uma VARIAVEL (plpgsql v_ano), nao de CTE — com ano opaco o planner nao usa o indice de intel_locais (5.6s); com v_ano usa (sub-segundo). force_custom_plan. Aditivo, faixa 9000+. APLICADA DIRETO via pg em 2026-10-20.

create or replace function public.intel_adversarios_reduto(
  p_election bigint, p_municipio int, p_sq bigint, p_nbairros int default 5, p_nadv int default 4
)
returns table (sq_candidato bigint, nome_urna text, partido_sigla text, votos_reduto bigint, votos_municipio bigint, bairros text)
language plpgsql stable security invoker set search_path = public set plan_cache_mode = 'force_custom_plan' as $$
declare v_ano smallint;
begin
  select e.ano into v_ano from public.intel_elections e where e.id = p_election;
  return query
  with cand_bairros as (
    select l.bairro, sum(sv.votos)::bigint v
    from public.intel_secao_votos sv
    join public.intel_locais l on l.ano = v_ano and l.cd_municipio = sv.cd_municipio and l.nr_zona = sv.nr_zona and l.nr_secao = sv.nr_secao
    where sv.election_id = p_election and sv.cd_municipio = p_municipio and sv.sq_candidato = p_sq and l.bairro is not null and l.bairro <> ''
    group by l.bairro
    order by v desc
    limit greatest(p_nbairros, 1)
  ),
  secoes as (
    select distinct l.nr_zona, l.nr_secao
    from public.intel_locais l join cand_bairros cb on cb.bairro = l.bairro
    where l.ano = v_ano and l.cd_municipio = p_municipio
  ),
  top_mun as (
    select cm.sq_candidato
    from public.intel_cand_mun cm
    where cm.election_id = p_election and cm.cd_municipio = p_municipio and cm.sq_candidato <> p_sq
    order by cm.votos desc
    limit 40
  ),
  adv as (
    select sv.sq_candidato, sum(sv.votos)::bigint v
    from public.intel_secao_votos sv
    join top_mun t on t.sq_candidato = sv.sq_candidato
    join secoes s on s.nr_zona = sv.nr_zona and s.nr_secao = sv.nr_secao
    where sv.election_id = p_election and sv.cd_municipio = p_municipio
    group by sv.sq_candidato
    order by v desc
    limit greatest(p_nadv, 1)
  )
  select a.sq_candidato, c.nome_urna, c.partido_sigla, a.v,
         coalesce(cm.votos, 0)::bigint as votos_municipio,
         (select string_agg(cb.bairro, ', ' order by cb.v desc) from cand_bairros cb) as bairros
  from adv a
  join public.intel_candidatos c on c.election_id = p_election and c.sq_candidato = a.sq_candidato
  left join public.intel_cand_mun cm on cm.election_id = p_election and cm.sq_candidato = a.sq_candidato and cm.cd_municipio = p_municipio
  order by a.v desc;
end; $$;

grant execute on function public.intel_adversarios_reduto(bigint, int, bigint, int, int) to authenticated;

notify pgrst, 'reload schema';
