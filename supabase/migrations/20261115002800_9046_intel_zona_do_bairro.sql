-- manifest: 9046 — RPC intel_zona_do_bairro(municipio, uf, bairro, ano): resolve a ZONA ELEITORAL dominante de um bairro a partir dos dados do TSE (intel_locais/intel_municipios), para carimbar a zona num Local (Fase 2B). Reusa a mesma normalização (upper+unaccent) e a lógica de zona dominante do intel_zona_leads (9021). SECURITY INVOKER (a RLS de leitura dos intel_* já cobre). Aditivo, faixa 9000+ do fork.

create or replace function public.intel_zona_do_bairro(
  p_municipio_nome text,
  p_uf text,
  p_bairro text,
  p_ano int
)
returns smallint
language sql
stable
security invoker
set search_path = public
as $$
  with mun as (
    select tse_code::int as cd
    from public.intel_municipios
    where upper(unaccent(nome)) = upper(unaccent(p_municipio_nome))
      and (p_uf is null or p_uf = '' or upper(uf) = upper(p_uf))
    limit 1
  )
  select l.nr_zona
  from public.intel_locais l, mun
  where l.ano = p_ano
    and l.cd_municipio = mun.cd
    and l.bairro is not null
    and upper(unaccent(l.bairro)) = upper(unaccent(p_bairro))
  group by l.nr_zona
  order by count(*) desc
  limit 1;
$$;

revoke all on function public.intel_zona_do_bairro(text, text, text, int) from public, anon;
grant execute on function public.intel_zona_do_bairro(text, text, text, int) to authenticated, service_role;

notify pgrst, 'reload schema';
