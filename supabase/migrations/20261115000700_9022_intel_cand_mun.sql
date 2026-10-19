-- manifest: 9022 — Modulo Inteligencia (Raio-X): PERFORMANCE + CORRECAO do ranking por municipio + ENDERECO das escolas. (1) intel_cand_mun: agregado MATERIALIZADO candidato x municipio por SQ_CANDIDATO (votos). O ranking_mun antigo agregava intel_secao_votos na hora (17s em BH) E errava vereador (nr_votavel NAO e unico por eleicao — municipios reusam numeros, join por nr misturava candidatos). Agora ranking_mun le intel_cand_mun por sq (correto) -> 0.3s. POPULADO PELO PIPELINE DE IMPORT (refresh apos carregar intel_secao_votos): insert into intel_cand_mun select election_id, sq_candidato, cd_municipio, sum(votos) from intel_secao_votos group by 1,2,3. (2) intel_zona_locais ganha coluna ENDERECO (de intel_locais) — saber onde fica a escola e estrategico. Aditivo/corretivo, faixa 9000+. APLICADA DIRETO via pg em 2026-10-19.

-- Agregado materializado candidato x municipio (populado pelo import).
create table if not exists public.intel_cand_mun (
  election_id  bigint not null,
  sq_candidato bigint not null,
  cd_municipio int    not null,
  votos        int    not null default 0
);
create index if not exists intel_cand_mun_rank on public.intel_cand_mun (election_id, cd_municipio, votos desc);
create index if not exists intel_cand_mun_sq on public.intel_cand_mun (election_id, sq_candidato);
alter table public.intel_cand_mun enable row level security;
drop policy if exists intel_cand_mun_read on public.intel_cand_mun;
create policy intel_cand_mun_read on public.intel_cand_mun for select to authenticated using (true);
grant select on public.intel_cand_mun to authenticated;
revoke all on public.intel_cand_mun from anon;

-- Ranking por municipio: le o agregado por SQ (correto + instantaneo).
create or replace function public.intel_cand_ranking_mun(p_election bigint, p_municipio int, p_q text default null, p_limit int default 50, p_offset int default 0)
returns table (sq_candidato bigint, nr_votavel text, nome_urna text, nome text, partido_sigla text, situacao text, votos_total int, posicao bigint)
language sql stable security invoker set search_path = public as $$
  select c.sq_candidato, c.nr_votavel, c.nome_urna, c.nome, c.partido_sigla, c.situacao, cm.votos,
         row_number() over (order by cm.votos desc) as posicao
  from public.intel_cand_mun cm
  join public.intel_candidatos c on c.election_id = cm.election_id and c.sq_candidato = cm.sq_candidato
  where cm.election_id = p_election and cm.cd_municipio = p_municipio
    and (p_q is null or p_q = '' or c.nome_urna ilike '%'||p_q||'%' or c.nome ilike '%'||p_q||'%' or c.nr_votavel = p_q)
  order by cm.votos desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

-- Top locais da zona + ENDERECO da escola.
drop function if exists public.intel_zona_locais(bigint, bigint, int, int);
create function public.intel_zona_locais(p_election bigint, p_sq bigint, p_municipio int, p_zona int)
returns table (local_nome text, bairro text, endereco text, votos bigint)
language sql stable security invoker set search_path = public as $$
  with e as (select ano from public.intel_elections where id = p_election)
  select coalesce(l.local_nome, 'Zona '||sv.nr_zona||' seção '||sv.nr_secao) as ln, max(l.bairro) as bairro, max(l.endereco) as endereco, sum(sv.votos)::bigint as votos
  from public.intel_secao_votos sv join e on true
  left join public.intel_locais l on l.ano = e.ano and l.cd_municipio = sv.cd_municipio and l.nr_zona = sv.nr_zona and l.nr_secao = sv.nr_secao
  where sv.election_id = p_election and sv.sq_candidato = p_sq and sv.cd_municipio = p_municipio and sv.nr_zona = p_zona
  group by coalesce(l.local_nome, 'Zona '||sv.nr_zona||' seção '||sv.nr_secao)
  order by sum(sv.votos) desc;
$$;

grant execute on function public.intel_cand_ranking_mun(bigint, int, text, int, int) to authenticated;
grant execute on function public.intel_zona_locais(bigint, bigint, int, int) to authenticated;

notify pgrst, 'reload schema';
