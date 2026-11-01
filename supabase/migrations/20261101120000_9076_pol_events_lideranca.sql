-- 9076 — vincular EVENTO (pol_events) a uma LIDERANÇA.
--
-- Por que existe: a ficha da liderança tem o contador "eventos", mas os eventos
-- de Locais & Eventos nascem em pol_events SEM dono de liderança — então o
-- contador nunca subia. Agora o evento pode apontar a liderança responsável
-- (quem organizou/trouxe a palestra), o contador conta de verdade, e a própria
-- liderança (quando tiver acesso) consegue creditar seus eventos. Aditivo,
-- faixa 9000+ do fork político.
alter table public.pol_events
  add column if not exists lideranca_id uuid references public.pol_liderancas(id) on delete set null;

create index if not exists idx_pol_events_lideranca
  on public.pol_events (organization_id, lideranca_id)
  where lideranca_id is not null;

comment on column public.pol_events.lideranca_id is
  'Liderança responsável pelo evento (quem organizou/trouxe). Alimenta o contador de eventos na ficha da liderança. Null = sem liderança atribuída.';
