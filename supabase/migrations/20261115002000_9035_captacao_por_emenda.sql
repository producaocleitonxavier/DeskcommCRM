-- manifest: 9035 — Gabinete/Emendas: CAPTAÇÃO POR EMENDA. pol_leads ganha pol_emenda_id (FK): a entidade beneficiada pela emenda cadastra beneficiários pelo link público /e/<emenda>, que entram na base atribuídos à emenda. Espelha a captação por obra (9034). Aditivo, faixa 9000+. APLICADA DIRETO via pg em 2026-10-20.

alter table public.pol_leads add column if not exists pol_emenda_id uuid references public.pol_emendas(id) on delete set null;
create index if not exists idx_pol_leads_emenda on public.pol_leads(pol_emenda_id) where pol_emenda_id is not null;

notify pgrst, 'reload schema';
