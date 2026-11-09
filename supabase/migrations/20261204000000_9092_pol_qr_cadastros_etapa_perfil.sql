-- manifest: 9092 — etapa_perfil no cadastro do QR (perfilamento CONVERSACIONAL)
--
-- O perfilamento progressivo (cidade/bairro/aniversário) passou de LINK de
-- formulário para PERGUNTAS NA PRÓPRIA CONVERSA (decisão do cliente 09/nov: link
-- cru assusta/parece vírus; e botão nativo não é confiável na conexão WAHA/NOWEB).
-- O funil do QR vira uma máquina de estados: depois do material, pergunta cidade,
-- depois bairro, depois aniversário — uma pergunta por vez. Esta coluna guarda em
-- QUAL passo a pessoa está, pra saber o que fazer com a próxima resposta dela.
--
-- Valores: null (fora do fluxo de perfil) | 'cidade' | 'bairro' | 'aniversario' | 'done'.
-- Os dados em si continuam no CONTATO (cidade/bairro em contacts.custom_fields,
-- aniversário em contacts.birthdate='2000-MM-DD'), idêntico ao que o formulário
-- público já gravava — esta coluna é só o CONTROLE do passo-a-passo.

alter table public.pol_qr_cadastros
  add column if not exists etapa_perfil text;

comment on column public.pol_qr_cadastros.etapa_perfil is
  'Passo do perfilamento CONVERSACIONAL pós-material: cidade -> bairro -> aniversario -> done. null = não iniciado.';

notify pgrst, 'reload schema';
