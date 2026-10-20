-- manifest: 9034 — Gabinete/Obras: CAPTAÇÃO POR OBRA (Camada 2 do ROI de Emenda). pol_leads ganha pol_obra_id (FK): quem a entidade/projeto cadastra pelo link público /o/<obra> entra na base JÁ atribuído à obra. + CORREÇÃO CRÍTICA: intel_peso_bairro agora conta leads tanto no formato endereco_gip.bairro (base GIP) quanto custom_fields.bairro (captação pública) — sem isso, leads captados por link NÃO eram contados no peso (bug silencioso). Aditivo, faixa 9000+. APLICADA DIRETO via pg em 2026-10-20.

alter table public.pol_leads add column if not exists pol_obra_id uuid references public.pol_obras(id) on delete set null;
create index if not exists idx_pol_leads_obra on public.pol_leads(pol_obra_id) where pol_obra_id is not null;

-- Recria intel_peso_bairro contando os DOIS formatos de bairro/cidade (coalesce).
create or replace function public.intel_peso_bairro(p_election bigint, p_sq bigint, p_municipio int, p_bairro text)
returns table (meus_votos bigint, universo bigint, leads bigint)
language plpgsql stable security invoker set search_path = public set plan_cache_mode = 'force_custom_plan' as $$
declare v_ano smallint; v_bnorm text; v_cidade text;
begin
  select e.ano into v_ano from public.intel_elections e where e.id = p_election;
  v_bnorm := upper(unaccent(coalesce(p_bairro, '')));
  select upper(unaccent(nome)) into v_cidade from public.intel_municipios where tse_code = p_municipio::text;
  return query
  with secs as (select l.nr_zona, l.nr_secao from public.intel_locais l where l.ano = v_ano and l.cd_municipio = p_municipio and upper(unaccent(l.bairro)) = v_bnorm),
  mv as (select coalesce(sum(sv.votos), 0)::bigint v from public.intel_secao_votos sv join secs s on s.nr_zona = sv.nr_zona and s.nr_secao = sv.nr_secao where sv.election_id = p_election and sv.cd_municipio = p_municipio and sv.sq_candidato = p_sq),
  uni as (select coalesce(sum(st.total), 0)::bigint v from public.intel_secao_total st join secs s on s.nr_zona = st.nr_zona and s.nr_secao = st.nr_secao where st.election_id = p_election and st.cd_municipio = p_municipio),
  lds as (select count(*)::bigint v from public.pol_leads pl join public.contacts ct on ct.id = pl.contact_id
          where upper(unaccent(coalesce(ct.custom_fields->'endereco_gip'->>'bairro', ct.custom_fields->>'bairro'))) = v_bnorm
            and upper(unaccent(coalesce(ct.custom_fields->'endereco_gip'->>'cidade', ct.custom_fields->>'cidade'))) = v_cidade)
  select (select v from mv), (select v from uni), (select v from lds);
end; $$;
grant execute on function public.intel_peso_bairro(bigint, bigint, int, text) to authenticated;

notify pgrst, 'reload schema';
