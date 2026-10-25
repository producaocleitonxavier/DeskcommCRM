-- manifest: 9050 — pol_carimbar_zonas_leads(org): carimba a ZONA ELEITORAL provável em pol_leads a partir do BAIRRO do contato (dados do TSE via intel_zona_do_bairro, 9046). É a forma LEGAL de ter a zona sem consultar o eleitor pelo nome (que a LGPD/TSE não permitem): deriva a zona DOMINANTE do bairro. Set-based (uma chamada por bairro distinto, não por pessoa), idempotente (só preenche zona nula/vazia). Lê cidade/bairro/uf de custom_fields nos formatos que coexistem (endereco_gip | endereco | flat). Retorna quantas pessoas foram carimbadas. Rodar após importar a base. Aditivo, faixa 9000+ do fork.

create or replace function public.pol_carimbar_zonas_leads(p_org uuid)
returns integer
language plpgsql
security invoker
as $$
declare
  v_count integer;
begin
  with base as (
    select
      pl.id as lead_id,
      coalesce(c.custom_fields->'endereco_gip'->>'cidade', c.custom_fields->'endereco'->>'cidade', c.custom_fields->>'cidade') as cidade,
      coalesce(c.custom_fields->'endereco_gip'->>'estado', c.custom_fields->'endereco'->>'estado', c.custom_fields->>'uf', c.custom_fields->>'estado') as uf,
      coalesce(c.custom_fields->'endereco_gip'->>'bairro', c.custom_fields->'endereco'->>'bairro', c.custom_fields->>'bairro') as bairro
    from public.pol_leads pl
    join public.contacts c on c.id = pl.contact_id
    where pl.organization_id = p_org
      and (pl.zona_eleitoral is null or pl.zona_eleitoral = '')
  ),
  distintos as (
    select distinct cidade, uf, bairro
    from base
    where cidade is not null and bairro is not null and btrim(cidade) <> '' and btrim(bairro) <> ''
  ),
  zonas as (
    select cidade, uf, bairro, public.intel_zona_do_bairro(cidade, uf, bairro, 2024) as zona
    from distintos
  ),
  upd as (
    update public.pol_leads pl
    set zona_eleitoral = z.zona::text
    from base b
    join zonas z
      on z.cidade is not distinct from b.cidade
      and z.uf is not distinct from b.uf
      and z.bairro is not distinct from b.bairro
    where pl.id = b.lead_id
      and z.zona is not null
    returning pl.id
  )
  select count(*) into v_count from upd;
  return v_count;
end;
$$;

revoke all on function public.pol_carimbar_zonas_leads(uuid) from anon;
grant execute on function public.pol_carimbar_zonas_leads(uuid) to authenticated;

notify pgrst, 'reload schema';
