-- manifest: 9049 — campo pol_municipio (texto livre) em demandas: o MUNICÍPIO da demanda, padronizado para vereador e deputado. Substitui o uso de Território (pol_territory_id, que era bairro/zona) no cadastro do gabinete; o território fica dormente. Aditivo, faixa 9000+ do fork.

alter table public.demandas
  add column if not exists pol_municipio text;

notify pgrst, 'reload schema';
