-- manifest: 9021 — Modulo Inteligencia (Raio-X): RADAR ZONAL — a zona vira unidade de operacao de campo, cruzando TSE + nossa base (CRM). intel_radar_zonal(eleicao, candidato, municipio) devolve por zona os votos do candidato + os BAIRROS que a zona abrange (de intel_locais). intel_zona_locais(..., zona) devolve os TOP LOCAIS de votacao (escolas) do candidato na zona. intel_zona_leads(municipio, ano) devolve, por zona, quantos LEADS NOSSOS caem ali — mapeando contacts.custom_fields->endereco_gip->bairro -> zona dominante (bairro->zona do intel_locais). Esta ultima e SECURITY INVOKER: respeita a RLS de contacts/pol_leads, entao cada org so ve a propria base (multi-tenant seguro). Precisa de unaccent. Aditivo, faixa 9000+ do fork. APLICADA DIRETO via pg em 2026-10-19; arquivo = registro p/ baseline.

create extension if not exists unaccent;

-- Por zona: votos do candidato + bairros abrangidos.
create or replace function public.intel_radar_zonal(p_election bigint, p_sq bigint, p_municipio int)
returns table (nr_zona smallint, votos bigint, bairros text[])
language sql stable security invoker set search_path = public as $$
  with e as (select ano from public.intel_elections where id = p_election),
  v as (
    select sv.nr_zona, sum(sv.votos)::bigint as votos
    from public.intel_secao_votos sv
    where sv.election_id = p_election and sv.sq_candidato = p_sq and sv.cd_municipio = p_municipio
    group by sv.nr_zona
  ),
  b as (
    select l.nr_zona, array_agg(distinct l.bairro order by l.bairro) as bairros
    from public.intel_locais l, e
    where l.ano = e.ano and l.cd_municipio = p_municipio and l.bairro is not null
    group by l.nr_zona
  )
  select v.nr_zona, v.votos, coalesce(b.bairros, array[]::text[])
  from v left join b on b.nr_zona = v.nr_zona
  order by v.votos desc;
$$;

-- Top locais de votacao (escolas) do candidato numa zona.
create or replace function public.intel_zona_locais(p_election bigint, p_sq bigint, p_municipio int, p_zona int)
returns table (local_nome text, bairro text, votos bigint)
language sql stable security invoker set search_path = public as $$
  with e as (select ano from public.intel_elections where id = p_election)
  select coalesce(l.local_nome, 'Zona '||sv.nr_zona||' seção '||sv.nr_secao) as ln, max(l.bairro) as bairro, sum(sv.votos)::bigint as votos
  from public.intel_secao_votos sv
  join e on true
  left join public.intel_locais l on l.ano = e.ano and l.cd_municipio = sv.cd_municipio and l.nr_zona = sv.nr_zona and l.nr_secao = sv.nr_secao
  where sv.election_id = p_election and sv.sq_candidato = p_sq and sv.cd_municipio = p_municipio and sv.nr_zona = p_zona
  group by coalesce(l.local_nome, 'Zona '||sv.nr_zona||' seção '||sv.nr_secao)
  order by sum(sv.votos) desc;
$$;

-- Leads do CRM por zona (bairro -> zona dominante). SECURITY INVOKER: RLS da org.
create or replace function public.intel_zona_leads(p_municipio int, p_ano int)
returns table (nr_zona smallint, leads bigint)
language sql stable security invoker set search_path = public as $$
  with bz as (
    select upper(unaccent(l.bairro)) bnorm, l.nr_zona,
           row_number() over (partition by upper(unaccent(l.bairro)) order by count(*) desc) rn
    from public.intel_locais l
    where l.ano = p_ano and l.cd_municipio = p_municipio and l.bairro is not null
    group by upper(unaccent(l.bairro)), l.nr_zona
  ),
  bz1 as (select bnorm, nr_zona from bz where rn = 1),
  mun as (select upper(unaccent(nome)) nom from public.intel_municipios where tse_code = p_municipio::text),
  leads as (
    select upper(unaccent(ct.custom_fields->'endereco_gip'->>'bairro')) bnorm
    from public.pol_leads pl join public.contacts ct on ct.id = pl.contact_id, mun
    where upper(unaccent(ct.custom_fields->'endereco_gip'->>'cidade')) = mun.nom
      and ct.custom_fields->'endereco_gip'->>'bairro' is not null
  )
  select bz1.nr_zona, count(*)::bigint
  from leads join bz1 on bz1.bnorm = leads.bnorm
  group by bz1.nr_zona;
$$;

grant execute on function public.intel_radar_zonal(bigint, bigint, int) to authenticated;
grant execute on function public.intel_zona_locais(bigint, bigint, int, int) to authenticated;
grant execute on function public.intel_zona_leads(int, int) to authenticated;

notify pgrst, 'reload schema';
