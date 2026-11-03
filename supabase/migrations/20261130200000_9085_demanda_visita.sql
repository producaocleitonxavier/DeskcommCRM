-- 9085 — VISITA TÉCNICA da demanda: marcar "realizada" + espelhar na Agenda.
--
-- Duas colunas aditivas e idempotentes (instalação sem elas segue funcionando —
-- a lista/detalhe detectam antes de usar):
--   · demandas.pol_visita_realizada_em  — quando a visita técnica foi FEITA
--     (null = marcada e ainda não realizada). A DATA da visita já mora em
--     demandas.prazo_em; aqui guardamos só se/quando aconteceu.
--   · pol_agenda.demanda_id — liga o compromisso de VISITA (tipo='visita') à
--     demanda que o originou, para o upsert não duplicar e para navegar entre os
--     dois. A visita da demanda passa a aparecer na Agenda do gabinete.

alter table public.demandas
  add column if not exists pol_visita_realizada_em date;

-- Quem vai na visita: UM responsável, escolhido entre os ASSESSORES CADASTRADOS
-- da org (campo vazio = "ninguém marcou", um alerta). Guardamos o id (para ligar
-- ao assessor_id da Agenda) e o nome de exibição resolvido (para a lista/relatório
-- não dependerem de um join a cada leitura).
alter table public.demandas
  add column if not exists pol_visita_responsavel_id uuid references auth.users(id) on delete set null;
alter table public.demandas
  add column if not exists pol_visita_responsavel_nome text;

alter table public.pol_agenda
  add column if not exists demanda_id uuid references public.demandas(id) on delete set null;

create index if not exists pol_agenda_demanda_idx
  on public.pol_agenda (organization_id, demanda_id);

comment on column public.demandas.pol_visita_realizada_em is
  'Gabinete: data em que a visita técnica da demanda foi realizada (null = marcada e ainda não feita).';
comment on column public.demandas.pol_visita_responsavel_id is
  'Gabinete: assessor (membro da org) que vai/foi na visita técnica. null = ninguém marcou.';
comment on column public.demandas.pol_visita_responsavel_nome is
  'Gabinete: nome de exibição do responsável pela visita, resolvido na gravação.';
comment on column public.pol_agenda.demanda_id is
  'Gabinete: demanda que originou este compromisso de visita (espelho visita técnica ↔ Agenda).';
