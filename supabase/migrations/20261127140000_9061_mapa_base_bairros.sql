-- manifest: 9061 — pol_mapa_base_bairros(org, cidade): ranking de BAIRROS com cadastros numa cidade, para o drill-down da lista "Onde está sua base". EXATO e sob demanda: agrega SÓ os bairros que REALMENTE têm cadastro (group by do que existe em custom_fields) — nunca pré-popula bairros. Casa a cidade por lower+unaccent (mesmo critério do mapa de cidades 9060). Exclui bloqueados. SECURITY INVOKER (respeita RLS). Aditivo, faixa 9000+ do fork.

create or replace function public.pol_mapa_base_bairros(p_org uuid, p_cidade text)
returns table(bairro text, total bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with b as (
    select
      btrim(coalesce(
        c.custom_fields->'endereco_gip'->>'bairro',
        c.custom_fields->'endereco'->>'bairro',
        c.custom_fields->>'bairro'
      )) as bairro,
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
  select bairro, count(*)::bigint as total
  from b
  where cidade_norm = lower(unaccent(btrim(p_cidade)))
    and bairro is not null
    and bairro <> ''
  group by bairro
  order by total desc, bairro asc
  limit 40
$$;

revoke all on function public.pol_mapa_base_bairros(uuid, text) from anon;
grant execute on function public.pol_mapa_base_bairros(uuid, text) to authenticated;

notify pgrst, 'reload schema';
