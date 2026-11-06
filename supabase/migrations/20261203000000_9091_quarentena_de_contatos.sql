-- manifest: 9091 — quarentena de contatos: lista fria importada não entra no disparo em massa (anti-ban, pós-morte do chip do Gabinete Digital)

-- Contato FRIO (lista importada de terceiros) nasce em quarentena: fica FORA do
-- disparo em massa até ESQUENTAR por engajamento (relacionamento instantâneo —
-- quem responde aceitou o contato). Default false: a base própria já existente,
-- e tudo que entra por origem morna (QR, inbound, evento, cadastro manual),
-- continua elegível. Só a importação de planilha marca `true`.
alter table public.contacts
  add column if not exists em_quarentena boolean not null default false;

comment on column public.contacts.em_quarentena is
  'Contato frio (lista importada) retido FORA do disparo em massa até esquentar por engajamento. Trava anti-ban: impede repetir o blast de lista fria que queima chip/BM.';

-- Índice parcial: só as linhas em quarentena (poucas, transitórias) — serve a
-- contagem/listagem por organização sem pesar o caminho quente.
create index if not exists idx_contacts_em_quarentena
  on public.contacts (organization_id)
  where em_quarentena;

notify pgrst, 'reload schema';
