-- 9075 — PRAZO DE ATENDIMENTO configurável por demanda (em DIAS).
--
-- Por que existe: o "Atrasada" do gabinete usava a Data da VISITA como prazo —
-- então uma demanda de ontem com visita de ontem já aparecia atrasada. Errado:
-- cada secretaria dá um prazo diferente (30/60/90 dias). Agora a pessoa
-- responsável preenche o prazo acordado (em dias a partir da abertura), e o
-- "Atrasada" conta a partir de `aberta_em + pol_prazo_dias`. Null = padrão 30 no
-- app. Aditivo, faixa 9000+ do fork político.
alter table public.demandas add column if not exists pol_prazo_dias integer;

comment on column public.demandas.pol_prazo_dias is
  'Prazo de atendimento acordado com o órgão, em DIAS a partir de aberta_em (ex.: 30/60/90). Preenchido pelo responsável. Null = o app usa 30 dias como padrão.';
