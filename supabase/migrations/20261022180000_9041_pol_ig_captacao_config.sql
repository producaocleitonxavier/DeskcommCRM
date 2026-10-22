-- manifest: 9041 — personalizacao da captacao do Instagram por organizacao: tabela pol_ig_captacao_config (1 linha por org: regiao-alvo do candidato — estado/cidade/abrangencia/cidades extras — e os textos do flow de captacao: resposta ao comentario, DM de pesquisa, DM pedindo WhatsApp). Faz o Kanban de captacao e a qualificacao (MG/BH ou qualquer cidade) se adaptarem por candidato, sem chumbar a corrida do Cleiton. Aditivo, faixa 9000+ do fork (ver docs/politico-fork-strategy.md).

create table if not exists public.pol_ig_captacao_config (
  organization_id            uuid        primary key references public.organizations(id) on delete cascade,
  ativo                      boolean     not null default true,
  -- regiao-alvo do candidato
  estado_alvo                text,       -- UF, ex "MG"
  cidade_alvo                text,       -- ex "Belo Horizonte"
  abrangencia                text        not null default 'cidade'
    check (abrangencia in ('cidade', 'cidade_rm', 'estado')),
  cidades_extra              text[]      not null default '{}', -- regiao metropolitana / cidades que tambem contam como alvo
  -- textos do flow (ManyChat)
  texto_resposta_comentario  text,
  texto_dm_pesquisa          text,
  texto_dm_whatsapp          text,
  pedir_whatsapp_so_alvo     boolean     not null default true,
  updated_at                 timestamptz not null default now()
);

alter table public.pol_ig_captacao_config enable row level security;

drop policy if exists tenant_isolation_pol_ig_captacao_config_all on public.pol_ig_captacao_config;
create policy tenant_isolation_pol_ig_captacao_config_all on public.pol_ig_captacao_config for all
  using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));

grant select, insert, update, delete on public.pol_ig_captacao_config to authenticated;
revoke all on public.pol_ig_captacao_config from anon;

notify pgrst, 'reload schema';
