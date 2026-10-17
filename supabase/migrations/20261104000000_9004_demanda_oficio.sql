-- manifest: 9004 — numero do oficio na demanda (Gabinete): pol_oficio_numero/pol_oficio_ano em demandas, atribuidos na PRIMEIRA emissao do oficio em PDF (sequencial por organizacao/ano, estavel depois disso). Aditivo, faixa 9000+ reservada para migrations proprietarias do fork (ver docs/politico-fork-strategy.md).

alter table public.demandas
  add column if not exists pol_oficio_numero integer,
  add column if not exists pol_oficio_ano integer;

comment on column public.demandas.pol_oficio_numero is
  'Numero sequencial do oficio (por organizacao/ano), atribuido ao gerar o PDF. Null = oficio ainda nao emitido.';

notify pgrst, 'reload schema';
