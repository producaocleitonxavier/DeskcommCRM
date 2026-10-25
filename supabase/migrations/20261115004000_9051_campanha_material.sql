-- manifest: vincula um MATERIAL (ebook da biblioteca pol_materiais) a uma
-- campanha de disparo, e marca quando o material foi entregue a cada
-- destinatário — para a entrega automática na resposta "SIM" ser idempotente.
--
-- Fluxo (reply-gated, decisão do cliente 2026-10-25): o disparo manda o convite
-- ("posso te enviar o ebook? responde SIM"); quando a pessoa responde
-- afirmativamente, o sistema entrega o material como ANEXO (WAHA sendFile a
-- partir de pol_materiais.url), SEM repassar ao gabinete. material_entregue_at
-- garante que a entrega acontece UMA vez por pessoa.

alter table public.campaigns
  add column if not exists material_id uuid
    references public.pol_materiais(id) on delete set null;

comment on column public.campaigns.material_id is
  'Material (pol_materiais) entregue automaticamente quando o destinatário responde SIM ao disparo. NULL = disparo sem material.';

alter table public.campaign_recipients
  add column if not exists material_entregue_at timestamptz;

comment on column public.campaign_recipients.material_entregue_at is
  'Quando o material da campanha foi entregue a este destinatário (entrega reply-gated). NULL = ainda não entregue. Garante idempotência.';

create index if not exists campaign_recipients_material_pendente_idx
  on public.campaign_recipients (organization_id, contact_id)
  where material_entregue_at is null;
