-- 9066 — Ofício: número MANUAL (rótulo livre) + destinatário/autoridade manual.
--
-- Cada gabinete tem o SEU método de numerar ofício (ex.: "OF. GAB.VER.CX –
-- 405/2026"); o sistema não deve decidir isso. E o bloco do destinatário
-- (autoridade/cargo/endereço) a IA não tem como saber — é preenchido à mão.
--
-- Duas colunas de texto em `demandas` (preenchidas no detalhe da demanda):
--   pol_oficio_rotulo      → o número/rótulo do ofício, mostrado VERBATIM.
--   pol_oficio_destinatario→ o bloco "Ao Excelentíssimo Senhor / nome / cargo /
--                            endereço", mostrado no rodapé do ofício.
-- Idempotente (IF NOT EXISTS): seguro rodar mais de uma vez.

alter table demandas add column if not exists pol_oficio_rotulo text;
alter table demandas add column if not exists pol_oficio_destinatario text;

comment on column demandas.pol_oficio_rotulo is
  'Número/rótulo manual do ofício (cada gabinete usa o seu método), mostrado verbatim no PDF e no aviso. Ex.: "OF. GAB.VER.CX – 405/2026".';
comment on column demandas.pol_oficio_destinatario is
  'Bloco do destinatário/autoridade do ofício, preenchido à mão (a IA não sabe). Ex.: "Ao Excelentíssimo Senhor\nFulano\nSecretário...\nEndereço".';
