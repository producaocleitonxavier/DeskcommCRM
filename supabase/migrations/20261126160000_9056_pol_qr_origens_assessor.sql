-- manifest: 9056 — QR creditando o assessor. Cada origem (ponto/link de QR) ganha um "assessor responsável" OPCIONAL: todo cadastro feito por aquele link credita esse assessor, pra o placar dele contar "quantas pessoas EU cadastrei". O crédito mora na ORIGEM (configurada 1x na criação, por gerente+ com sessão) e NÃO no cadastro — que chega por inbound anônimo (admin client, sem sessão), de onde não dá pra inferir a pessoa. Deriva-se o assessor via origem_id (NOT NULL, já indexado) sem tocar o insert do inbound. Aditivo, nullable, faixa 9000+ do fork.

alter table public.pol_qr_origens
  add column if not exists assessor_user_id uuid references auth.users(id) on delete set null;

-- Placar do assessor: contar cadastros via as origens dele. Índice parcial
-- (só os pontos COM assessor), espelha o padrão dos outros índices parciais do QR.
create index if not exists idx_pol_qr_origens_assessor
  on public.pol_qr_origens(organization_id, assessor_user_id)
  where assessor_user_id is not null;

notify pgrst, 'reload schema';
