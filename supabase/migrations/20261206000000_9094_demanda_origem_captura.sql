-- manifest: 9094 — marca a demanda vinda da CAPTURA DE CAMPO (Gabinete de Rua)
--
-- O "Registros de Rua" (card no Hoje + quadro filtrado em /demandas) precisa
-- distinguir o que nasceu da captura de 10s do que foi criado pela Nova Demanda
-- ou pelo inbound. Guarda a origem: 'campo' = captura de rua; null = demais.
-- Aditiva, nullable. Índice parcial (só as de campo) para o filtro ser barato.
-- Faixa 9000+ reservada para migrations proprietárias do fork.

alter table public.demandas
  add column if not exists pol_origem_captura text;

comment on column public.demandas.pol_origem_captura is
  'Origem da demanda quando veio de um fluxo especial. ''campo'' = Captura de Campo (Gabinete de Rua). null = Nova Demanda/inbound.';

create index if not exists idx_demandas_origem_captura
  on public.demandas(organization_id, pol_origem_captura)
  where pol_origem_captura is not null;

notify pgrst, 'reload schema';
