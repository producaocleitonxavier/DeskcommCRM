-- manifest: 9047 — campo material_id em pol_events: qual material da Biblioteca (pol_materiais) é o ebook enviado às pessoas cadastradas naquele evento (Fase 2C — ebook por evento). FK on delete set null (se o material sumir, o evento fica sem ebook, não quebra). Aditivo, faixa 9000+ do fork.

alter table public.pol_events
  add column if not exists material_id uuid references public.pol_materiais(id) on delete set null;

create index if not exists idx_pol_events_material on public.pol_events(material_id) where material_id is not null;

notify pgrst, 'reload schema';
