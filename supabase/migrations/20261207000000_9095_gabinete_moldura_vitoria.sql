-- manifest: 9095 — moldura de Stories "Antes & Depois" do mandato (Situação Política)
--
-- A identidade visual é responsabilidade do GABINETE: o designer dele sobe a
-- moldura (PNG 1080x1920 com 2 janelas transparentes Antes/Depois) e a ferramenta
-- só encaixa as fotos nas janelas. Guarda o caminho do arquivo no bucket privado
-- gabinete-identidade. Aditiva, nullable. Faixa 9000+ do fork.

alter table public.pol_gabinete_config
  add column if not exists moldura_vitoria_path text;

comment on column public.pol_gabinete_config.moldura_vitoria_path is
  'Caminho (bucket gabinete-identidade) da moldura PNG de Stories Antes&Depois. 2 janelas transparentes = onde as fotos entram. null = gabinete ainda não subiu.';

notify pgrst, 'reload schema';
