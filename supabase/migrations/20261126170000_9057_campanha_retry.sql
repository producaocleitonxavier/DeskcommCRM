-- manifest: 9057 — Retry 24h do disparo. Opt-in por campanha (`retry_24h`): quem recebeu o convite e NÃO respondeu em 24h recebe UMA cutucada. `retry_at` no destinatário trava pra ser UMA vez só (idempotente). Aditivo, faixa 9000+ do fork.

alter table public.campaigns add column if not exists retry_24h boolean not null default false;
alter table public.campaign_recipients add column if not exists retry_at timestamptz;

-- O retry procura, por campanha com retry ligado, destinatários enviados há ≥24h,
-- sem resposta e sem retry ainda. Índice parcial pra essa varredura ser barata.
create index if not exists idx_campaign_recipients_retry
  on public.campaign_recipients(campaign_id, sent_at)
  where replied_at is null and retry_at is null;

notify pgrst, 'reload schema';
