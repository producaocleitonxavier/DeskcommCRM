-- manifest: 9055 — Índice do cadastro por QR com material PENDENTE. O passo 2 procura, a cada inbound, um cadastro deste contato ainda sem material entregue (aguardando nome, ou nome dado e entrega a re-tentar). Índice parcial por (org, contato) nos pendentes. Aditivo.

create index if not exists idx_pol_qr_cadastros_pendente
  on public.pol_qr_cadastros(organization_id, contact_id)
  where material_entregue_at is null;

notify pgrst, 'reload schema';
