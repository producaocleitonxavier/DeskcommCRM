-- 9068 — Localização ESTRUTURADA da demanda (onde está o problema).
--
-- Deixar o local solto na justificativa faz o assessor preencher mal e tira a
-- credibilidade do registro. Separando em campos, o endereço do problema fica
-- padronizado (e pronto para alimentar o ofício e a inteligência territorial).
--
-- A "Cidade" reusa a coluna que já existe (pol_municipio). Novas:
--   pol_logradouro → Rua / Avenida
--   pol_numero     → Número (texto: aceita "s/n", "715-A", etc.)
--   pol_bairro     → Bairro
-- Idempotente.

alter table demandas add column if not exists pol_logradouro text;
alter table demandas add column if not exists pol_numero text;
alter table demandas add column if not exists pol_bairro text;

comment on column demandas.pol_logradouro is 'Rua/Avenida do problema da demanda (localizacao estruturada).';
comment on column demandas.pol_numero is 'Numero do endereco do problema (texto: aceita s/n, 715-A).';
comment on column demandas.pol_bairro is 'Bairro do problema da demanda.';
