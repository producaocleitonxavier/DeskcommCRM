-- 9088 — Autoria do RELATO da visita. O responsável pela visita pode não ser quem
-- escreve o relato: assessores com dificuldade no celular ditam, e um COLEGA do
-- gabinete registra a partir da ficha. Guardamos quem preencheu, para um carimbo
-- discreto "registrado por <nome>" quando for diferente do responsável.
--
-- Aditivo e idempotente — instalação sem as colunas segue funcionando (o módulo
-- detecta antes de gravar/mostrar).

alter table public.demandas
  add column if not exists pol_visita_relato_por_id uuid references auth.users(id) on delete set null;
alter table public.demandas
  add column if not exists pol_visita_relato_por_nome text;

comment on column public.demandas.pol_visita_relato_por_id is
  'Visita técnica: quem preencheu o relato (pode ser um colega, não o responsável).';
comment on column public.demandas.pol_visita_relato_por_nome is
  'Visita técnica: nome de exibição de quem preencheu o relato, resolvido na gravação.';
