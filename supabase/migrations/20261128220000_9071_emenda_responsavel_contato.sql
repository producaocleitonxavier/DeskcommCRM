-- 9071 — Responsável pela emenda como CONTATO (dados completos pra avisar).
--
-- Hoje `responsavel_nome` é só texto livre. Pra avisar o responsável quando a
-- emenda sair (e pra ele entrar na base com dados completos), ele vira um
-- CONTATO vinculado. `responsavel_nome` fica (compat/exibição).
--
-- Idempotente.

alter table pol_emendas add column if not exists responsavel_contact_id uuid references contacts(id) on delete set null;

comment on column pol_emendas.responsavel_contact_id is
  'Contato do responsavel pela emenda (criado/vinculado no cadastro). Permite avisar quando a emenda sair e ter os dados completos na base.';
