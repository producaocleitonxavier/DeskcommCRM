-- manifest: 9093 — quem REGISTROU a demanda (placar por assessor do Comando do Gabinete)
--
-- Para o "Placar da equipe" (o político ver o que CADA pessoa produziu) e o "Hoje
-- pessoal" (o assessor ver o SEU), precisamos saber QUEM criou cada demanda. As
-- colunas existentes não servem: `dono_user_id`/`dono_kind` é o DONO/responsável
-- (o inbound põe dono_kind='ia'); `pol_assessor_nome` é texto livre opcional;
-- `pol_visita_relato_por_id` é só da visita. Esta coluna guarda, sem ambiguidade,
-- o USUÁRIO LOGADO que registrou a demanda no sistema (carimbado na criação por
-- `criarRegistro` em app/actions/politico/gabinete-actions.ts).
--
-- Aditiva, nullable (demandas antigas / inbound ficam null = "não atribuída").
-- Faixa 9000+ reservada para migrations proprietárias do fork.

alter table public.demandas
  add column if not exists pol_registrado_por_id uuid references auth.users(id) on delete set null;

comment on column public.demandas.pol_registrado_por_id is
  'Usuário (membro) que REGISTROU a demanda no sistema. Base do placar por assessor. null = demanda antiga ou criada pelo inbound/IA.';

create index if not exists idx_demandas_registrado_por
  on public.demandas(organization_id, pol_registrado_por_id);

notify pgrst, 'reload schema';
