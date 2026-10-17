-- manifest: 9008 — flag pol_gabinete em demandas (Gabinete): separa as demandas DO GABINETE (criadas na tela, origem='manual') das criadas automaticamente no ponto de entrada do WhatsApp (gatilho da 0138, origem='inbound'), que poluiam a lista do Gabinete. A lista/KPIs/export/graficos passam a mostrar SO pol_gabinete=true. Backfill: as demandas manuais existentes viram do gabinete. Aditivo (default false e rapido no Postgres >=11), faixa 9000+ reservada para migrations proprietarias do fork (ver docs/politico-fork-strategy.md).

alter table public.demandas
  add column if not exists pol_gabinete boolean not null default false;

-- Backfill: o que foi criado manualmente (a tela do Gabinete grava origem='manual')
-- passa a ser demanda do gabinete. As automaticas (origem='inbound'/'handoff'/
-- 'followup'/'derivada') ficam de fora.
update public.demandas set pol_gabinete = true where origem = 'manual' and pol_gabinete = false;

-- Indice parcial para a listagem do gabinete (so as linhas que importam).
create index if not exists demandas_pol_gabinete_idx
  on public.demandas (organization_id, aberta_em desc)
  where pol_gabinete;

notify pgrst, 'reload schema';
