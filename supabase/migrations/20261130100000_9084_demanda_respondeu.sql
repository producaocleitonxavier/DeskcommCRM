-- 9084 — "O órgão respondeu?" na demanda (COBRANÇA POR ÓRGÃO).
--
-- O gabinete manda ofício para um órgão (COPASA, CEMIG, Prefeitura…) e precisa
-- saber o que está parado SEM resposta para cobrar. Marcamos se o órgão de
-- destino já respondeu o ofício e quando. Aditivo e idempotente — instalação
-- sem a coluna segue funcionando (a lista detecta a coluna antes de usar).

alter table public.demandas
  add column if not exists pol_respondeu boolean not null default false;
alter table public.demandas
  add column if not exists pol_respondeu_em date;

comment on column public.demandas.pol_respondeu is
  'Gabinete: o órgão de destino já respondeu o ofício desta demanda? (para cobrança)';
comment on column public.demandas.pol_respondeu_em is
  'Gabinete: data em que o órgão de destino respondeu o ofício.';
