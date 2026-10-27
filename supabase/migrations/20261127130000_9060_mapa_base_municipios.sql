-- manifest: 9060 — pol_mapa_base_municipios(org): agrega a BASE do CRM por município de MG, para o MAPA DE CALOR de cidades (choropleth exato). Casa a cidade do contato (custom_fields, normalizada por lower+unaccent) ao municipio oficial em intel_municipios (uf=MG) → código IBGE, que casa com a malha /geo/mg-municipios.geojson (feature.codarea). EXATO: usa dado real (IBGE), sem inventar coordenada; cidade não reconhecida simplesmente não entra (o chamador conta as "não localizadas"). Exclui bloqueados (bate com a lista de Pessoas). SECURITY INVOKER (respeita RLS). Aditivo, faixa 9000+ do fork.

create or replace function public.pol_mapa_base_municipios(p_org uuid)
returns table(
  ibge_code text,
  nome text,
  total bigint,
  novos bigint,
  simpatizantes bigint,
  apoiadores bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with b as (
    select
      pl.support_level,
      lower(unaccent(btrim(coalesce(
        c.custom_fields->'endereco_gip'->>'cidade',
        c.custom_fields->'endereco'->>'cidade',
        c.custom_fields->>'cidade'
      )))) as cidade_norm
    from public.pol_leads pl
    join public.contacts c on c.id = pl.contact_id
    where pl.organization_id = p_org
      and coalesce(c.is_blocked, false) = false
  )
  select
    m.ibge_code,
    m.nome,
    count(*)::bigint as total,
    count(*) filter (where b.support_level = 'novo_cadastro')::bigint as novos,
    count(*) filter (where b.support_level = 'simpatizante')::bigint as simpatizantes,
    count(*) filter (where b.support_level in ('apoiador', 'militante', 'voto_certo'))::bigint as apoiadores
  from b
  join public.intel_municipios m
    on m.uf = 'MG'
    and lower(unaccent(btrim(m.nome))) = b.cidade_norm
  where b.cidade_norm is not null and b.cidade_norm <> ''
  group by m.ibge_code, m.nome
$$;

revoke all on function public.pol_mapa_base_municipios(uuid) from anon;
grant execute on function public.pol_mapa_base_municipios(uuid) to authenticated;

notify pgrst, 'reload schema';
