-- manifest: 9006 — papel timbrado do gabinete (Gabinete/War Room): coluna timbrado_path em pol_gabinete_config, imagem A4 (PNG/JPG) que o oficio usa como FUNDO de pagina inteira — para o gabinete que ja tem documento timbrado pronto, cabendo ao sistema so sobrepor o texto. Reusa o bucket gabinete-identidade. Aditivo, faixa 9000+ reservada para migrations proprietarias do fork (ver docs/politico-fork-strategy.md).

alter table public.pol_gabinete_config
  add column if not exists timbrado_path text;

comment on column public.pol_gabinete_config.timbrado_path is
  'Imagem A4 do papel timbrado (fundo de pagina do oficio). Quando presente, o PDF sobrepoe so o texto e oculta o cabecalho/rodape gerados.';

notify pgrst, 'reload schema';
