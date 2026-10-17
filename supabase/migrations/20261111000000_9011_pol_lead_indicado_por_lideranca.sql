-- manifest: 9011 — atribuicao de cadastro a uma lideranca (Gabinete/War Room): coluna pol_lideranca_id em pol_leads = qual lideranca TROUXE/indicou aquela pessoa. Alimenta a metrica "pessoas indicadas" por lideranca (contada ao vivo, para medir quem de fato trabalha). Difere de mobilizer_id (que referencia contacts). on delete set null. Aditivo, faixa 9000+ reservada para migrations proprietarias do fork (ver docs/politico-fork-strategy.md).

alter table public.pol_leads
  add column if not exists pol_lideranca_id uuid references public.pol_liderancas(id) on delete set null;

create index if not exists pol_leads_org_lideranca_idx
  on public.pol_leads (organization_id, pol_lideranca_id)
  where pol_lideranca_id is not null;

notify pgrst, 'reload schema';
