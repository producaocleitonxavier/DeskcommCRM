-- manifest: 9013 — tipos de lideranca ENXUTOS (Gabinete/War Room): conjunto final apoiador/cabo_eleitoral/vereador_aliado/lider_religioso/deputado/prefeito/vice_prefeito/outro. Consolida os antigos (coordenadores + lider_comunitario -> cabo_eleitoral; presidente_associacao/lider_sindical/assessor -> outro) e troca o CHECK. REMAPEIA os registros existentes ANTES de aplicar o constraint (senao linhas antigas violam). Faixa 9000+ reservada para migrations proprietarias do fork (ver docs/politico-fork-strategy.md).

-- 1. Remapeia os tipos que saem para os que ficam (evita violacao do novo CHECK).
update public.pol_liderancas set tipo = 'cabo_eleitoral'
  where tipo in ('coordenador_bairro', 'coordenador_cidade', 'lider_comunitario');
update public.pol_liderancas set tipo = 'outro'
  where tipo in ('presidente_associacao', 'lider_sindical', 'assessor');

-- 2. Troca o CHECK para o conjunto final.
alter table public.pol_liderancas drop constraint if exists pol_liderancas_tipo_check;
alter table public.pol_liderancas add constraint pol_liderancas_tipo_check check (tipo in (
  'apoiador', 'cabo_eleitoral', 'vereador_aliado', 'lider_religioso',
  'deputado', 'prefeito', 'vice_prefeito', 'outro'
));

notify pgrst, 'reload schema';
