-- manifest: Adiciona colunas de credencial Instagram Business em channel_sessions e estende constraints de provider para suportar integração direta via Graph API
--
-- O Instagram Business usa a MESMA Graph API do WhatsApp Cloud, mas com
-- credenciais e endpoints diferentes. A sessão de canal Instagram precisa de:
-- - ig_business_account_id: o ID da conta Instagram Business (resolve mídia, perfil)
-- - ig_page_id: o Page ID da página Facebook vinculada (necessário para envio de DM)
-- - ig_access_token_encrypted: token cifrado (mesma infra fn_encrypt_oauth/fn_decrypt_oauth)
--
-- O provider 'instagram' entra na constraint de provider E na constraint de
-- referência (exige ig_business_account_id preenchido).

-- 1. Novas colunas na channel_sessions
alter table public.channel_sessions
  add column if not exists ig_business_account_id text,
  add column if not exists ig_page_id text,
  add column if not exists ig_access_token_encrypted bytea,
  add column if not exists ig_token_expires_at timestamptz;

comment on column public.channel_sessions.ig_business_account_id is
  'Instagram Business Account ID — identifica a conta no Graph API. Resolve mídia, comentários e perfis.';

comment on column public.channel_sessions.ig_page_id is
  'Facebook Page ID vinculada à conta Instagram Business. Necessário para envio de DMs via Conversations API.';

comment on column public.channel_sessions.ig_access_token_encrypted is
  'Access token do Instagram/Facebook cifrado com fn_encrypt_oauth (pgp_sym AES-256). Long-lived, 60 dias.';

comment on column public.channel_sessions.ig_token_expires_at is
  'Quando o long-lived token expira. Renovação automática antes de vencer.';

-- 2. Índice único parcial (mesma lógica do meta_phone_number_id)
create unique index if not exists channel_sessions_ig_business_account_id_ativo_unique
  on public.channel_sessions (organization_id, ig_business_account_id)
  where ig_business_account_id is not null and archived_at is null;

-- 3. Estender constraint de provider para aceitar 'instagram'
alter table public.channel_sessions
  drop constraint if exists channel_sessions_provider_check;

alter table public.channel_sessions
  add constraint channel_sessions_provider_check
  check (provider = any (array[
    'waha'::text, 'meta_cloud'::text, 'zernio'::text,
    'wacalls'::text, 'zernio_social'::text, 'datafy'::text,
    'instagram'::text
  ]));

-- 4. Estender constraint de referência
alter table public.channel_sessions
  drop constraint if exists channel_sessions_provider_ref_check;

alter table public.channel_sessions
  add constraint channel_sessions_provider_ref_check check (
    (provider = 'waha'       and waha_session_name      is not null) or
    (provider = 'meta_cloud' and meta_phone_number_id    is not null) or
    (provider in ('zernio', 'zernio_social') and zernio_account_id is not null) or
    (provider = 'wacalls'    and wacalls_session_id      is not null) or
    (provider = 'datafy'     and datafy_phone_number_id  is not null) or
    (provider = 'instagram'  and ig_business_account_id  is not null)
  );
