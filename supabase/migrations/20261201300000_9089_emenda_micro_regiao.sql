-- 9089 — Emenda: MICRO-REGIÃO + flag "repartida no município todo".
--
-- · micro_regiao: granularidade abaixo da meso-região (gap vs. Tramonte). Relevante
--   para DEPUTADO (meso + micro). Opcional, texto livre.
-- · repartida_municipio: a emenda é distribuída no MUNICÍPIO INTEIRO (ex.: asfalto),
--   não num bairro específico — confirmado pela secretaria do gabinete. Quando true,
--   o bairro deixa de fazer sentido.
--
-- Aditivo e idempotente — instalação sem as colunas segue funcionando.

alter table public.pol_emendas
  add column if not exists micro_regiao text;
alter table public.pol_emendas
  add column if not exists repartida_municipio boolean not null default false;

comment on column public.pol_emendas.micro_regiao is
  'Emenda: micro-região (abaixo da meso-região; relevante p/ deputado).';
comment on column public.pol_emendas.repartida_municipio is
  'Emenda: distribuída no município inteiro (repartida), não num bairro.';
