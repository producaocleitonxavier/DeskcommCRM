-- manifest: 9017 — Modulo Inteligencia (Pilar 1 TSE): RAIO-X DE VOTOS no nivel de SECAO (padrao raioxvotos, MG). Tres tabelas de referencia publica (GLOBAIS, RLS leitura p/ authenticated, escrita service_role): intel_candidatos (dim por eleicao: nr, SQ, nome, nome_urna, partido, situacao "Eleito/Suplente", votos_total — do consulta_cand), intel_locais (dim de local de votacao por ano: escola, BAIRRO, endereco, cep, lat/long — do eleitorado_local_votacao) e intel_secao_votos (FATO grao secao: votos por eleicao x candidato x municipio x zona x secao). RPCs: intel_cand_ranking (busca+ranking), intel_cand_drill (drill municipio/zona/bairro/local/secao) e intel_eleicao_total. pg_trgm p/ busca por nome. Aditivo, faixa 9000+ do fork.

create extension if not exists pg_trgm;

-- =====================================================================
-- Dimensao: candidatos por eleicao
-- =====================================================================
create table if not exists public.intel_candidatos (
  election_id   bigint  not null references public.intel_elections(id) on delete cascade,
  sq_candidato  bigint  not null,
  nr_votavel    text    not null,
  nome          text    not null,
  nome_urna     text,
  partido_sigla text,
  partido_num   smallint,
  situacao      text,                 -- DS_SIT_TOT_TURNO (Eleito, Eleito por QP, Suplente, Nao eleito...)
  coligacao     text,
  votos_total   int     not null default 0,
  primary key (election_id, sq_candidato)
);
create index if not exists intel_candidatos_rank_idx on public.intel_candidatos (election_id, votos_total desc);
create index if not exists intel_candidatos_nome_trgm on public.intel_candidatos using gin (nome_urna gin_trgm_ops);
create index if not exists intel_candidatos_nomec_trgm on public.intel_candidatos using gin (nome gin_trgm_ops);

-- =====================================================================
-- Dimensao: local de votacao (bairro + coordenadas) por ano
-- =====================================================================
create table if not exists public.intel_locais (
  ano          smallint not null,
  cd_municipio int      not null,     -- CD_MUNICIPIO do TSE
  nr_zona      smallint not null,
  nr_secao     smallint not null,
  local_nome   text,
  bairro       text,
  endereco     text,
  cep          text,
  latitude     numeric,
  longitude    numeric,
  primary key (ano, cd_municipio, nr_zona, nr_secao)
);
create index if not exists intel_locais_mun_idx on public.intel_locais (ano, cd_municipio);

-- =====================================================================
-- Fato: votos por secao
-- =====================================================================
create table if not exists public.intel_secao_votos (
  election_id  bigint   not null references public.intel_elections(id) on delete cascade,
  sq_candidato bigint   not null,
  cd_municipio int      not null,
  nr_zona      smallint not null,
  nr_secao     smallint not null,
  votos        int      not null default 0
);
create index if not exists intel_secao_cand_idx on public.intel_secao_votos (election_id, sq_candidato);
create index if not exists intel_secao_mun_idx on public.intel_secao_votos (election_id, cd_municipio);

-- =====================================================================
-- RLS (dados publicos)
-- =====================================================================
alter table public.intel_candidatos   enable row level security;
alter table public.intel_locais        enable row level security;
alter table public.intel_secao_votos   enable row level security;
drop policy if exists intel_candidatos_read on public.intel_candidatos;
create policy intel_candidatos_read on public.intel_candidatos for select to authenticated using (true);
drop policy if exists intel_locais_read on public.intel_locais;
create policy intel_locais_read on public.intel_locais for select to authenticated using (true);
drop policy if exists intel_secao_votos_read on public.intel_secao_votos;
create policy intel_secao_votos_read on public.intel_secao_votos for select to authenticated using (true);
grant select on public.intel_candidatos to authenticated;
grant select on public.intel_locais to authenticated;
grant select on public.intel_secao_votos to authenticated;
revoke all on public.intel_candidatos from anon;
revoke all on public.intel_locais from anon;
revoke all on public.intel_secao_votos from anon;

-- =====================================================================
-- RPCs
-- =====================================================================

-- Ranking/busca de candidatos de uma eleicao (q = nome/numero opcional).
create or replace function public.intel_cand_ranking(p_election bigint, p_q text default null, p_limit int default 50, p_offset int default 0)
returns table (sq_candidato bigint, nr_votavel text, nome_urna text, nome text, partido_sigla text, situacao text, votos_total int, posicao bigint)
language sql stable security invoker set search_path = public as $$
  select c.sq_candidato, c.nr_votavel, c.nome_urna, c.nome, c.partido_sigla, c.situacao, c.votos_total,
         row_number() over (order by c.votos_total desc) as posicao
  from public.intel_candidatos c
  where c.election_id = p_election
    and (p_q is null or p_q = '' or c.nome_urna ilike '%'||p_q||'%' or c.nome ilike '%'||p_q||'%' or c.nr_votavel = p_q)
  order by c.votos_total desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

-- Total de votos validos (nominais) de uma eleicao.
create or replace function public.intel_eleicao_total(p_election bigint)
returns bigint language sql stable security invoker set search_path = public as $$
  select coalesce(sum(votos), 0)::bigint from public.intel_election_results where election_id = p_election;
$$;

-- Drill de um candidato por dimensao: 'municipio' | 'zona' | 'bairro' | 'local' | 'secao'.
-- Para zona/bairro/local/secao, escopar a um municipio (p_municipio = CD_MUNICIPIO do TSE).
-- universo = votos validos do municipio (p/ a % relativa, como no raioxvotos).
create or replace function public.intel_cand_drill(p_election bigint, p_sq bigint, p_dim text, p_municipio int default null)
returns table (chave text, rotulo text, votos bigint, universo bigint)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_ano smallint;
begin
  select e.ano into v_ano from public.intel_elections e where e.id = p_election;

  if p_dim = 'municipio' then
    return query
      select sv.cd_municipio::text,
             coalesce(m.nome, sv.cd_municipio::text),
             sum(sv.votos)::bigint,
             coalesce((select sum(r.votos) from public.intel_election_results r
                       where r.election_id = p_election and r.tse_code = sv.cd_municipio::text), 0)::bigint
      from public.intel_secao_votos sv
      left join public.intel_municipios m on m.tse_code = sv.cd_municipio::text
      where sv.election_id = p_election and sv.sq_candidato = p_sq
      group by sv.cd_municipio, m.nome
      order by sum(sv.votos) desc;
  else
    -- universo do municipio escopado
    return query
    with uni as (
      select coalesce(sum(r.votos), 0)::bigint as total
      from public.intel_election_results r
      where r.election_id = p_election and r.tse_code = p_municipio::text
    ),
    base as (
      select sv.nr_zona, sv.nr_secao, sv.votos,
             l.bairro, l.local_nome
      from public.intel_secao_votos sv
      left join public.intel_locais l
        on l.ano = v_ano and l.cd_municipio = sv.cd_municipio and l.nr_zona = sv.nr_zona and l.nr_secao = sv.nr_secao
      where sv.election_id = p_election and sv.sq_candidato = p_sq and sv.cd_municipio = p_municipio
    )
    select
      case p_dim
        when 'zona' then b.nr_zona::text
        when 'bairro' then coalesce(b.bairro, 'Sem bairro')
        when 'local' then coalesce(b.local_nome, 'Local '||b.nr_zona||'/'||b.nr_secao)
        else b.nr_zona::text||'-'||b.nr_secao::text
      end as chave,
      case p_dim
        when 'zona' then 'Zona '||b.nr_zona::text
        when 'bairro' then coalesce(b.bairro, 'Sem bairro')
        when 'local' then coalesce(b.local_nome, 'Local sem nome')
        else 'Zona '||b.nr_zona::text||' · Seção '||b.nr_secao::text
      end as rotulo,
      sum(b.votos)::bigint as votos,
      (select total from uni) as universo
    from base b
    group by 1, 2
    order by sum(b.votos) desc;
  end if;
end;
$$;

grant execute on function public.intel_cand_ranking(bigint, text, int, int) to authenticated;
grant execute on function public.intel_eleicao_total(bigint) to authenticated;
grant execute on function public.intel_cand_drill(bigint, bigint, text, int) to authenticated;

notify pgrst, 'reload schema';
