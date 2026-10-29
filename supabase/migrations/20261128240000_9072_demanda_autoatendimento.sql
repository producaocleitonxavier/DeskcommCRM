-- 9072 — Marcador de AUTOATENDIMENTO na demanda do gabinete.
--
-- A IA passa a registrar TODA zeladoria que o cidadão relata — inclusive as que
-- ele resolve sozinho pelo link oficial da Prefeitura (tapa-buraco, iluminação,
-- poda em via pública, etc.). Esses registros alimentam a inteligência
-- territorial (quem pediu o quê, em que bairro), mas NÃO são trabalho do
-- gabinete: ninguém vai emitir ofício por eles.
--
-- Sem um marcador, a fila de Demandas encheria desses casos e a assessora não
-- distinguiria mais o que exige a mão do gabinete (esgoto/Copasa, urgência,
-- quem não consegue sozinho) do que é só registro. Esta coluna separa as duas
-- camadas: a tela esconde os de autoatendimento da fila de trabalho e os mostra
-- numa aba/filtro à parte ("A IA orientou").
--
-- `default false`: toda demanda anterior continua sendo trabalho do gabinete,
-- como sempre foi. Só o que a IA marcar explicitamente entra como autoatendimento.

alter table public.demandas
  add column if not exists pol_autoatendimento boolean not null default false;

comment on column public.demandas.pol_autoatendimento is
  'true = zeladoria que o cidadão resolve sozinho pelo link da Prefeitura; a IA registrou só para o histórico territorial. Fica fora da fila de trabalho do gabinete.';

-- Índice parcial: as consultas da tela vão quase sempre pedir "só o trabalho de
-- verdade" (pol_autoatendimento = false). O índice parcial mantém essa leitura
-- barata sem pesar nas poucas linhas de autoatendimento.
create index if not exists idx_demandas_trabalho_gabinete
  on public.demandas (organization_id, estado)
  where pol_gabinete = true and pol_autoatendimento = false;
