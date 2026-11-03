-- 9087 — RELATO da visita técnica: o assessor registra o que foi feito em campo,
-- e o gabinete inteiro vê (político/chefe acompanham o resultado sem perguntar).
--
-- Três campos livres (nenhum obrigatório), preenchidos ao marcar a visita como
-- realizada. Aditivo e idempotente — instalação sem eles segue funcionando (o
-- módulo detecta antes de mostrar/gravar).

alter table public.demandas
  add column if not exists pol_visita_relato text;
alter table public.demandas
  add column if not exists pol_visita_presentes text;
alter table public.demandas
  add column if not exists pol_visita_decisoes text;

comment on column public.demandas.pol_visita_relato is
  'Visita técnica: o que foi feito na visita (anotações do assessor).';
comment on column public.demandas.pol_visita_presentes is
  'Visita técnica: quem esteve presente na visita.';
comment on column public.demandas.pol_visita_decisoes is
  'Visita técnica: o que ficou decidido na visita.';
