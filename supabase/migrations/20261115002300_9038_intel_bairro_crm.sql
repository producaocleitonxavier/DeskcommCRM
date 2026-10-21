-- manifest: 9038 — Pilar 3 (Narrativas Territoriais): RPC intel_bairro_crm — cruza a base do CRM da ORG por bairro (leads por temperatura e estágio + demandas abertas/resolvidas), respeitando RLS (security invoker → cada org só vê a própria base). Alimenta a narrativa territorial com o retrato da operação no bairro. Casa os DOIS formatos de bairro/cidade (endereco_gip + custom_fields raiz), como a intel_peso_bairro. Aditivo, faixa 9000+. APLICADA DIRETO via pg em 2026-10-20.

create or replace function public.intel_bairro_crm(p_cidade text, p_bairro text)
returns table (
  leads_total bigint, leads_quente bigint, leads_morno bigint, leads_frio bigint, leads_forte bigint,
  dem_abertas bigint, dem_resolvidas bigint
)
language sql stable security invoker set search_path = public as $$
  with b as (
    select pl.temperature as temp, pl.support_level as sl
    from public.pol_leads pl
    join public.contacts ct on ct.id = pl.contact_id
    where upper(unaccent(coalesce(ct.custom_fields->'endereco_gip'->>'bairro', ct.custom_fields->>'bairro'))) = upper(unaccent(p_bairro))
      and upper(unaccent(coalesce(ct.custom_fields->'endereco_gip'->>'cidade', ct.custom_fields->>'cidade'))) = upper(unaccent(p_cidade))
  ),
  d as (
    select dm.estado as estado
    from public.demandas dm
    join public.contacts ct on ct.id = dm.contact_id
    where upper(unaccent(coalesce(ct.custom_fields->'endereco_gip'->>'bairro', ct.custom_fields->>'bairro'))) = upper(unaccent(p_bairro))
      and upper(unaccent(coalesce(ct.custom_fields->'endereco_gip'->>'cidade', ct.custom_fields->>'cidade'))) = upper(unaccent(p_cidade))
  )
  select
    (select count(*) from b)::bigint,
    (select count(*) from b where temp = 'quente')::bigint,
    (select count(*) from b where temp = 'morno')::bigint,
    (select count(*) from b where temp = 'frio')::bigint,
    (select count(*) from b where sl in ('apoiador', 'militante', 'voto_certo'))::bigint,
    (select count(*) from d where estado not in ('resolvida', 'encerrada'))::bigint,
    (select count(*) from d where estado = 'resolvida')::bigint;
$$;
grant execute on function public.intel_bairro_crm(text, text) to authenticated;

notify pgrst, 'reload schema';
