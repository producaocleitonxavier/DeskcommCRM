-- manifest: 9007 — margens do texto sobre o papel timbrado (Gabinete): timbrado_margem_topo_mm/base_mm/lados_mm em pol_gabinete_config, para calibrar onde o texto do oficio cai sobre o timbrado de CADA cliente (diagramacoes diferentes). Em milimetros; null = padrao do codigo. Aditivo, faixa 9000+ reservada para migrations proprietarias do fork (ver docs/politico-fork-strategy.md).

alter table public.pol_gabinete_config
  add column if not exists timbrado_margem_topo_mm  integer,
  add column if not exists timbrado_margem_base_mm  integer,
  add column if not exists timbrado_margem_lados_mm integer;

notify pgrst, 'reload schema';
