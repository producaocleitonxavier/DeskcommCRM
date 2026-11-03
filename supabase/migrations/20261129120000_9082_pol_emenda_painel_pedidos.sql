-- 9082 — Emendas: fundação do PAINEL DE INTELIGÊNCIA + CAPTAÇÃO DE PEDIDOS.
--
-- Duas coisas, sem quebrar nada do que já existe:
--
-- 1) CAPTAÇÃO DE PEDIDO: hoje a emenda já nasce "indicada" (o parlamentar já
--    decidiu). Falta o momento ANTES: alguém (prefeito, entidade, liderança)
--    PEDE uma emenda. Esse pedido entra como status 'solicitada' e o gabinete
--    depois atende (vira 'indicada') ou recusa. O DEFAULT continua 'indicada',
--    então o fluxo atual (vereador/deputado que já decide) fica INTACTO.
--
-- 2) PAINEL (igual aos melhores sistemas de gabinete): precisamos de dois
--    campos que esses sistemas mostram e nós ainda não guardávamos —
--    `modalidade` (o INSTRUMENTO: Convênio, Transferência Especial, Resolução,
--    Execução Direta...) e `meso_regiao` (a região do estado, p/ o deputado).
--
-- Tudo é ADITIVO e idempotente (roda de novo sem erro). Nada é obrigatório:
-- campo novo nasce NULL e o front trata a ausência.

-- (1) status: adiciona 'solicitada' ANTES de 'indicada' no CHECK existente.
alter table public.pol_emendas
  drop constraint if exists pol_emendas_status_check;
alter table public.pol_emendas
  add constraint pol_emendas_status_check
  check (status in (
    'solicitada',  -- pedido recebido, ainda não decidido (captação)
    'rascunho', 'indicada', 'empenhada', 'liquidada',
    'paga', 'devolvida', 'cancelada'
  ));

-- (2) campos novos (todos opcionais).
alter table public.pol_emendas
  add column if not exists modalidade text;             -- instrumento (Convênio, Transf. Especial...)
alter table public.pol_emendas
  add column if not exists meso_regiao text;            -- região do estado (deputado)
alter table public.pol_emendas
  add column if not exists data_solicitacao date;       -- quando o pedido chegou
alter table public.pol_emendas
  add column if not exists solicitante_nome text;       -- quem pediu (livre)
alter table public.pol_emendas
  add column if not exists solicitante_contact_id uuid
    references public.contacts(id) on delete set null;  -- quem pediu (vínculo ao contato)
alter table public.pol_emendas
  add column if not exists motivo_recusa text;          -- por que o pedido foi recusado

-- solicitante_origem com CHECK próprio (constraint separada p/ ser idempotente).
alter table public.pol_emendas
  add column if not exists solicitante_origem text;
alter table public.pol_emendas
  drop constraint if exists pol_emendas_solicitante_origem_check;
alter table public.pol_emendas
  add constraint pol_emendas_solicitante_origem_check
  check (solicitante_origem is null or solicitante_origem in (
    'lideranca', 'entidade', 'prefeitura', 'gabinete', 'publico'
  ));

-- Índice p/ a caixa de entrada de pedidos (listar os 'solicitada' por org).
create index if not exists idx_pol_emendas_solicitada
  on public.pol_emendas(organization_id, status)
  where status = 'solicitada';

-- Índice p/ agrupar por meso-região no painel do deputado.
create index if not exists idx_pol_emendas_meso
  on public.pol_emendas(organization_id, meso_regiao)
  where meso_regiao is not null;

comment on column public.pol_emendas.modalidade is 'Instrumento da emenda (Convênio, Transferência Especial, Resolução, Execução Direta, Caixa Escolar, Doação de Bens...). Livre.';
comment on column public.pol_emendas.meso_regiao is 'Meso-região do estado onde a emenda caiu (usado no painel do deputado).';
comment on column public.pol_emendas.solicitante_origem is 'De onde veio o PEDIDO de emenda: lideranca | entidade | prefeitura | gabinete | publico.';
