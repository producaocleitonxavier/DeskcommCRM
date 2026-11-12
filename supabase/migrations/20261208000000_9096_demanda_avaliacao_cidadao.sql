-- manifest: 9096 — Nota do cidadão: avaliação (1 a 5) do atendimento da demanda, por link público com token opaco
--
-- "Confiança" foi a dor nº 1 dos chefes de gabinete: o político não sabe se o
-- cidadão ficou bem atendido. O aviso de resolução/encerramento leva um link
-- /avaliar/<token>; a pessoa toca numa nota de 1 a 5 e, se quiser, escreve.
-- Mora NA demanda (uma avaliação por demanda — DIRC: não é entidade própria).
-- Aditiva, nullable, idempotente. Faixa 9000+ do fork.

alter table public.demandas
  add column if not exists pol_avaliacao_token text,
  add column if not exists pol_avaliacao_nota smallint,
  add column if not exists pol_avaliacao_comentario text,
  add column if not exists pol_avaliacao_em timestamptz;

alter table public.demandas drop constraint if exists demandas_pol_avaliacao_nota_check;
alter table public.demandas
  add constraint demandas_pol_avaliacao_nota_check
  check (pol_avaliacao_nota is null or pol_avaliacao_nota between 1 and 5);

create unique index if not exists idx_demandas_avaliacao_token
  on public.demandas(pol_avaliacao_token)
  where pol_avaliacao_token is not null;

create index if not exists idx_demandas_avaliacao_nota
  on public.demandas(organization_id, pol_avaliacao_em)
  where pol_avaliacao_nota is not null;

notify pgrst, 'reload schema';
