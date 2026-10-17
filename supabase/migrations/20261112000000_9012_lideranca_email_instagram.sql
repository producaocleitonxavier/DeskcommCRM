-- manifest: 9012 — e-mail e instagram na liderança (Gabinete/War Room): colunas email e instagram em pol_liderancas, para contato completo da liderança (como no War Room v1). Aditivo, faixa 9000+ reservada para migrations proprietarias do fork (ver docs/politico-fork-strategy.md).

alter table public.pol_liderancas
  add column if not exists email     text,
  add column if not exists instagram text;

notify pgrst, 'reload schema';
