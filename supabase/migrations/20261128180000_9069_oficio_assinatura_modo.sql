-- 9069 — Modo da assinatura do ofício, por gabinete.
--
-- Dois cenários reais:
--   'imagem'  → o gabinete tem uma imagem fixa de assinatura (sobe na Identidade);
--               o sistema desenha a linha + nome + a imagem no ofício. (Padrão —
--               comportamento atual.)
--   'gov_br'  → a assinatura é feita DEPOIS no gov.br (carimbo digital com hora
--               oficial, ICP) OU já vem embutida no papel timbrado. Nesse caso o
--               sistema NÃO desenha bloco de assinatura (evita a duplicata — ex.:
--               o timbrado do Cleiton já traz "Vereador Cleiton Xavier" no rodapé).
--
-- Padrão 'imagem' pra não mudar o comportamento de quem já usa. Idempotente.

alter table pol_gabinete_config add column if not exists oficio_assinatura_modo text not null default 'imagem';

comment on column pol_gabinete_config.oficio_assinatura_modo is
  'Modo da assinatura no oficio: imagem (desenha linha+nome+imagem) ou gov_br (nao desenha bloco; assina no gov.br ou ja vem no timbrado).';
