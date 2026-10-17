-- manifest: 9010 — contato OPCIONAL na liderança (Gabinete): pol_liderancas.contact_id deixa de ser NOT NULL. A liderança tem nome próprio; vincular a um contato da base é opcional (apenas uma busca para associar, nunca um gate de cadastro). O unique (organization_id, contact_id) segue válido — no Postgres NULLs são distintos, então várias lideranças sem contato convivem. Aditivo, faixa 9000+ reservada para migrations proprietarias do fork (ver docs/politico-fork-strategy.md).

alter table public.pol_liderancas alter column contact_id drop not null;

notify pgrst, 'reload schema';
