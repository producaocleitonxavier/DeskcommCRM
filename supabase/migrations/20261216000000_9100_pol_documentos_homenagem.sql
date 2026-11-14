-- manifest: 9100 — pol_documentos aceita a função 'homenagem' (diploma, título, reunião solene): a proposta de honraria é documento à parte da moção, com homenageado, honraria e data de cerimônia. Só amplia a lista aceita; nenhuma linha existente muda. Idempotente (derruba e recria a regra).

alter table public.pol_documentos drop constraint if exists pol_documentos_funcao_check;
alter table public.pol_documentos add constraint pol_documentos_funcao_check
  check (funcao in ('pedido_comissao', 'providencia', 'informacao', 'manifestacao', 'homenagem'));

notify pgrst, 'reload schema';
