-- 9067 — Personalização da ESTRUTURA do ofício por gabinete.
--
-- Cada gabinete trabalha diferente (ex.: Cleiton/BH põe o destinatário no
-- RODAPÉ; Denilson/Contagem põe no TOPO e usa linha "Assunto:"). O ESTILO é
-- definido UMA vez na Identidade do Mandato; a operação do dia a dia só
-- preenche conteúdo.
--
-- pol_gabinete_config (estilo, por gabinete):
--   oficio_destinatario_posicao → 'topo' | 'rodape' (padrão 'rodape', estilo Cleiton).
--   oficio_mostrar_assunto       → liga a linha "Assunto:" e o campo na demanda.
-- demandas (conteúdo, por ofício):
--   pol_oficio_assunto           → o texto do assunto (aparece se ligado).
-- Idempotente.

alter table pol_gabinete_config add column if not exists oficio_destinatario_posicao text not null default 'rodape';
alter table pol_gabinete_config add column if not exists oficio_mostrar_assunto boolean not null default false;
alter table demandas add column if not exists pol_oficio_assunto text;

comment on column pol_gabinete_config.oficio_destinatario_posicao is
  'Onde o bloco do destinatario aparece no oficio: topo ou rodape. Padrao rodape.';
comment on column pol_gabinete_config.oficio_mostrar_assunto is
  'Liga a linha "Assunto:" no oficio (e o campo na demanda).';
comment on column demandas.pol_oficio_assunto is
  'Texto do "Assunto:" do oficio (so aparece se o gabinete ligou oficio_mostrar_assunto).';
