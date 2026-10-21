-- manifest: 9037 — Pilar 3 (Inteligência): NARRATIVAS TERRITORIAIS por IA. Tabela intel_territorial_narratives (org-scoped, RLS) que persiste a narrativa estratégica de um bairro gerada pela IA cruzando TSE × base CRM × demandas × lideranças, com riscos/oportunidades/ações e custo. RPC intel_adversarios_bairro: top candidatos num bairro específico ("a batalha" local), plpgsql v_ano (lição de perf). Aditivo, faixa 9000+. APLICADA DIRETO via pg em 2026-10-20.

create table if not exists public.intel_territorial_narratives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  election_id bigint,
  cd_municipio int,
  municipio_nome text,
  bairro text not null,
  regional text,
  narrative_text text not null,
  risks jsonb not null default '[]',
  opportunities jsonb not null default '[]',
  recommended_actions jsonb not null default '[]',
  data_sources jsonb not null default '{}',
  ai_model text,
  prompt_tokens int,
  completion_tokens int,
  cost_cents int,
  generated_at timestamptz not null default now()
);
create index if not exists idx_intel_narratives_org_bairro on public.intel_territorial_narratives(organization_id, bairro, generated_at desc);

alter table public.intel_territorial_narratives enable row level security;
drop policy if exists tenant_isolation_intel_narratives_all on public.intel_territorial_narratives;
create policy tenant_isolation_intel_narratives_all on public.intel_territorial_narratives for all
  using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));
grant select, insert, update, delete on public.intel_territorial_narratives to authenticated;
revoke all on public.intel_territorial_narratives from anon;

-- Top candidatos num bairro específico (a "batalha" local do bairro).
-- plpgsql com v_ano em VARIÁVEL (não CTE) para o planner usar o índice de intel_locais.
create or replace function public.intel_adversarios_bairro(p_election bigint, p_municipio int, p_bairro text, p_limit int default 8)
returns table (sq_candidato bigint, nome text, partido text, votos bigint)
language plpgsql stable security invoker set search_path = public set plan_cache_mode = 'force_custom_plan' as $$
declare v_ano smallint; v_bnorm text;
begin
  select e.ano into v_ano from public.intel_elections e where e.id = p_election;
  v_bnorm := upper(unaccent(coalesce(p_bairro, '')));
  return query
  with secs as (
    select l.nr_zona, l.nr_secao from public.intel_locais l
    where l.ano = v_ano and l.cd_municipio = p_municipio and upper(unaccent(l.bairro)) = v_bnorm
  ),
  votos as (
    select sv.sq_candidato as sq, sum(sv.votos)::bigint as v
    from public.intel_secao_votos sv
    join secs s on s.nr_zona = sv.nr_zona and s.nr_secao = sv.nr_secao
    where sv.election_id = p_election and sv.cd_municipio = p_municipio
    group by sv.sq_candidato
  )
  select vt.sq, coalesce(c.nome_urna, c.nome), c.partido_sigla, vt.v
  from votos vt
  join public.intel_candidatos c on c.election_id = p_election and c.sq_candidato = vt.sq
  order by vt.v desc
  limit p_limit;
end; $$;
grant execute on function public.intel_adversarios_bairro(bigint, int, text, int) to authenticated;

notify pgrst, 'reload schema';
