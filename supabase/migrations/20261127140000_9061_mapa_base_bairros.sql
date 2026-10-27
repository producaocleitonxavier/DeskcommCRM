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
      -- Normaliza o bairro (lower+unaccent) para UNIR variações do mesmo bairro:
      -- a base tem "UNIÀO"/"União"/"UNIÃO" como linhas diferentes (caixa + acento
      -- corrompido). Sem isso o ranking fragmenta o mesmo bairro em vários. A tela
      -- reexibe em Title Case; o acento se perde no display, mas a CONTAGEM fica exata.
      lower(unaccent(btrim(coalesce(
        c.custom_fields->'endereco_gip'->>'bairro',
        c.custom_fields->'endereco'->>'bairro',
        c.custom_fields->>'bairro'
      )))) as bairro_norm,
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
  select bairro_norm as bairro, count(*)::bigint as total
  from b
  where cidade_norm = lower(unaccent(btrim(p_cidade)))
    and bairro_norm is not null
    and bairro_norm <> ''
  group by bairro_norm
  order by total desc, bairro_norm asc
  limit 40
$$;

revoke all on function public.pol_mapa_base_bairros(uuid, text) from anon;
grant execute on function public.pol_mapa_base_bairros(uuid, text) to authenticated;

notify pgrst, 'reload schema';
