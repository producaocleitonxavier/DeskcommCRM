-- Bootstrap schema extraido dos specs DeskcommCRM
-- Aplicar no projeto novo ANTES de db push


-- ============================================================
-- 01-spec-platform-base.md
-- ============================================================

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";
create extension if not exists "citext";

-- Trigger de touch reusável
create or replace function public.fn_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create table public.organizations (
  id              uuid primary key default gen_random_uuid(),
  slug            citext not null unique,
  legal_name      text not null,
  display_name    text not null,
  cnpj            text unique, -- nullable pra tenants internos
  status          text not null default 'active'
                  check (status in ('active','suspended','redacted','archived')),
  timezone        text not null default 'America/Sao_Paulo',
  locale          text not null default 'pt-BR',
  rate_limit_rps  integer not null default 100, -- B-04
  ai_budget_cents bigint, -- nullable = ilimitado
  media_retention_days integer not null default 365, -- B-03
  settings        jsonb not null default '{}'::jsonb,
  -- LGPD/legal
  dpo_email       citext,
  privacy_policy_url text,
  -- Onboarding
  onboarded_at    timestamptz,
  suspended_at    timestamptz,
  redacted_at     timestamptz,
  -- Timestamps
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null
);

create trigger trg_organizations_touch
  before update on public.organizations
  for each row execute function public.fn_touch_updated_at();

comment on table public.organizations is 'Tenants do DeskcommCRM. Cada linha = 1 e-commerce cliente.';
comment on column public.organizations.cnpj is 'CNPJ formatado XX.XXX.XXX/XXXX-XX. Único por tenant ativo.';
comment on column public.organizations.status is 'active=operando | suspended=pausado por admin | redacted=LGPD store/redact aplicado | archived=cancelado.';

create table public.user_organizations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role            text not null
                  check (role in ('viewer','agent','manager','admin')),
  -- Apresentação por vínculo; autorização continua no papel/RLS.
  interface_settings jsonb not null default '{"preset":"completa"}'::jsonb,
  invited_by      uuid references auth.users(id) on delete set null,
  invited_at      timestamptz,
  accepted_at     timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, organization_id)
);

create trigger trg_user_orgs_touch
  before update on public.user_organizations
  for each row execute function public.fn_touch_updated_at();

create index idx_user_orgs_user      on public.user_organizations(user_id) where revoked_at is null;
create index idx_user_orgs_org_role  on public.user_organizations(organization_id, role) where revoked_at is null;

comment on column public.user_organizations.role is '4 roles canônicos: viewer (1) < agent (2) < manager (3) < admin (4). Hierarquia.';

create table public.platform_admins (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  granted_by      uuid not null references auth.users(id) on delete restrict,
  granted_at      timestamptz not null default now(),
  scope           text not null default 'full'
                  check (scope in ('full','support_readonly')),
  mfa_required    boolean not null default false,
  reason          text not null, -- justificativa obrigatória
  revoked_at      timestamptz,
  revoked_by      uuid references auth.users(id) on delete set null,
  revoke_reason   text
);

comment on table public.platform_admins is 'Administração transversal da instalação. Acompanhamento de dados tenant usa sessão temporária; modificação da autoridade não é exposta pela API.';

create table public.api_tokens (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by      uuid not null references auth.users(id) on delete restrict,
  name            text not null,
  prefix          text not null, -- ex: 'dsk_a3f9b2c4' (mostrado na UI; primeiros 12 chars)
  token_hash      bytea not null, -- sha256(plaintext) — plaintext NUNCA volta após criação
  scopes          jsonb not null default '[]'::jsonb,
                  -- ex: ["leads:read","leads:write","contacts:read","lgpd:execute"]
  last_used_at    timestamptz,
  last_used_ip    inet,
  expires_at      timestamptz, -- nullable = não expira
  revoked_at      timestamptz,
  revoked_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, prefix)
);

create trigger trg_api_tokens_touch
  before update on public.api_tokens
  for each row execute function public.fn_touch_updated_at();

create index idx_api_tokens_hash on public.api_tokens(token_hash) where revoked_at is null;
create index idx_api_tokens_org  on public.api_tokens(organization_id) where revoked_at is null;

comment on table public.api_tokens is 'Bearer tokens. Plaintext mostrado UMA vez na criação; depois apenas hash. Prefix visível na UI.';

create table public.api_audit_log (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid references public.organizations(id) on delete set null,
  -- Quem
  actor_user_id           uuid references auth.users(id) on delete set null,
  actor_api_token_id      uuid references public.api_tokens(id) on delete set null,
  acting_as_platform_admin boolean not null default false,
  actor_ip                inet,
  actor_user_agent        text,
  -- O quê
  action                  text not null, -- ex: 'lead.created', 'token.revoked'
  resource_type           text,          -- ex: 'lead', 'api_token', 'contact'
  resource_id             uuid,
  -- Contexto
  request_id              text,          -- correlaciona com X-Request-Id
  bypassed_rls            boolean not null default false, -- T-02
  metadata                jsonb not null default '{}'::jsonb,
                          -- diff, params relevantes (sanitizados)
  -- Quando
  created_at              timestamptz not null default now()
);

create index idx_audit_org_time      on public.api_audit_log(organization_id, created_at desc);
create index idx_audit_actor_time    on public.api_audit_log(actor_user_id, created_at desc);
create index idx_audit_action_time   on public.api_audit_log(action, created_at desc);
create index idx_audit_resource      on public.api_audit_log(resource_type, resource_id);
create index idx_audit_request       on public.api_audit_log(request_id);

-- L-10: append-only. Revoga UPDATE/DELETE do role da app.
revoke update, delete on public.api_audit_log from authenticated, anon, service_role;
-- DBA com superuser pode editar manualmente (raro, double-confirmation)

comment on table public.api_audit_log is 'L-10: Append-only. Retenção 5 anos (90d hot + cold storage S3). Logging fire-and-forget.';

-- Organizations
create index idx_orgs_status on public.organizations(status) where status = 'active';
create index idx_orgs_slug   on public.organizations(slug);

-- User_organizations já criados em 2.2

-- API tokens já criados em 2.4

-- Audit log já criados em 2.5

-- Recovery codes (ver §4.5)
create index idx_recovery_user on public.user_recovery_codes(user_id) where used_at is null;

-- Idempotency keys (ver §7.3)
create index idx_idem_lookup on public.idempotency_keys(organization_id, key, endpoint);
create index idx_idem_expiry on public.idempotency_keys(expires_at);

-- ============================================================
-- Helper 1: orgs do usuário corrente + alvo de suporte ainda válido
-- ============================================================
create or replace function public.fn_user_org_ids()
returns setof uuid
language sql stable
security definer
set search_path = public
as $$
  select organization_id
  from public.user_organizations
  where user_id = auth.uid()
    and revoked_at is null
  union
  select (support->>'organization_id')::uuid
  from (select public.fn_support_context() as support) current_support
  where support->>'status' = 'active';
$$;

-- ============================================================
-- Helper 2: detecta super-admin de plataforma
-- ============================================================
create or replace function public.fn_is_platform_admin()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins
    where user_id = auth.uid()
      and revoked_at is null
  );
$$;

-- ============================================================
-- Helper 3: role efetivo em uma org (membership ou suporte temporário)
-- ============================================================
create or replace function public.fn_user_role_in_org(p_org uuid)
returns text
language sql stable
security definer
set search_path = public
as $$
  select case
    when support->>'status' = 'active'
      and (support->>'organization_id')::uuid = p_org
      then case when support->>'access_mode' = 'full' then 'admin' else 'viewer' end
    else (
      select role from public.user_organizations
      where user_id = auth.uid()
        and organization_id = p_org
        and revoked_at is null
      limit 1
    )
  end
  from (select public.fn_support_context() as support) current_support;
$$;

-- Suporte não é membership. Cercas restritivas fazem support_readonly prevalecer
-- até sobre vínculo físico admin no alvo. Ler os templates históricos abaixo
-- junto da migration vigente e de docs/support-sessions.md: fn_is_platform_admin()
-- isolada não substitui a fronteira temporária.

-- ============================================================
-- Helper 4: comparador hierárquico de role
-- ============================================================
create or replace function public.fn_role_at_least(p_org uuid, p_min text)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  with levels(role, lvl) as (
    values ('viewer',1),('agent',2),('manager',3),('admin',4)
  )
  select coalesce(
    (select user_lvl.lvl >= min_lvl.lvl
     from levels user_lvl
     join levels min_lvl on min_lvl.role = p_min
     where user_lvl.role = public.fn_user_role_in_org(p_org)),
    false
  );
$$;

-- ============================================================
-- Habilitar RLS nas tabelas tenant-aware desta spec
-- ============================================================
alter table public.organizations         enable row level security;
alter table public.user_organizations    enable row level security;
alter table public.api_tokens            enable row level security;
alter table public.api_audit_log         enable row level security;
alter table public.platform_admins       enable row level security;

-- Template A: tenant_isolation_<tabela>_all
create policy "tenant_isolation_<tabela>_all" on public.<tabela>
  for all
  using (
    organization_id in (select public.fn_user_org_ids())
    or public.fn_is_platform_admin()
  )
  with check (
    organization_id in (select public.fn_user_org_ids())
    or public.fn_is_platform_admin()
  );

-- SELECT: qualquer membro do tenant
create policy "<tabela>_select" on public.<tabela>
  for select
  using (
    organization_id in (select public.fn_user_org_ids())
    or public.fn_is_platform_admin()
  );

-- INSERT/UPDATE/DELETE: apenas manager+
create policy "<tabela>_write" on public.<tabela>
  for all
  using (
    public.fn_role_at_least(organization_id, 'manager')
    or public.fn_is_platform_admin()
  )
  with check (
    public.fn_role_at_least(organization_id, 'manager')
    or public.fn_is_platform_admin()
  );

create policy "<tabela>_select_owner_or_manager" on public.<tabela>
  for select
  using (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and (
        public.fn_role_at_least(organization_id, 'manager')
        or owner_user_id = auth.uid()
      )
    )
  );

-- SELECT: admin do tenant ou platform admin
create policy "audit_log_select" on public.api_audit_log
  for select
  using (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin')
    )
  );

-- INSERT: qualquer service_role (handler) — outras roles via SECURITY DEFINER function
create policy "audit_log_insert_service" on public.api_audit_log
  for insert
  with check (true); -- inserção é controlada na camada de aplicação

-- UPDATE/DELETE: nenhuma policy. Permissão revogada explicitamente (§2.5).

-- organizations: usuário lê suas orgs; só platform admin cria/edita/deleta
create policy "orgs_select" on public.organizations
  for select using (
    id in (select public.fn_user_org_ids())
    or public.fn_is_platform_admin()
  );

create policy "orgs_write_platform_admin" on public.organizations
  for all using (public.fn_is_platform_admin())
  with check (public.fn_is_platform_admin());

-- user_organizations: usuário lê suas linhas; admin do tenant lê todas; admin escreve
create policy "user_orgs_select" on public.user_organizations
  for select using (
    user_id = auth.uid()
    or public.fn_role_at_least(organization_id, 'admin')
    or public.fn_is_platform_admin()
  );

create policy "user_orgs_write" on public.user_organizations
  for insert with check (
    public.fn_role_at_least(organization_id, 'admin')
    or public.fn_is_platform_admin()
  );

create policy "user_orgs_update" on public.user_organizations
  for update using (
    public.fn_role_at_least(organization_id, 'admin')
    or public.fn_is_platform_admin()
  );

create policy "user_orgs_delete" on public.user_organizations
  for delete using (
    public.fn_role_at_least(organization_id, 'admin')
    or public.fn_is_platform_admin()
  );

-- api_tokens: apenas admin do tenant ou platform admin
create policy "api_tokens_admin_only" on public.api_tokens
  for all using (
    public.fn_role_at_least(organization_id, 'admin')
    or public.fn_is_platform_admin()
  )
  with check (
    public.fn_role_at_least(organization_id, 'admin')
    or public.fn_is_platform_admin()
  );

-- platform_admins: apenas platform admins veem; modificação NÃO via API (T-04)
create policy "platform_admins_self" on public.platform_admins
  for select using (public.fn_is_platform_admin());
-- Nenhuma policy de INSERT/UPDATE/DELETE — bloqueio total via API

-- api_audit_log: usar Template D (já aplicado em §3.4)

create or replace function public.fn_jwt_custom_claims(uid uuid)
returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'tenant_ids', coalesce(
      (select jsonb_agg(organization_id)
       from public.user_organizations
       where user_id = uid and revoked_at is null),
      '[]'::jsonb
    ),
    'is_platform_admin', exists(
      select 1 from public.platform_admins
      where user_id = uid and revoked_at is null
    )
  );
$$;

create table public.user_recovery_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  code_hash   bytea not null, -- sha256
  used_at     timestamptz,
  used_ip     inet,
  created_at  timestamptz not null default now()
);

create unique index idx_recovery_unique on public.user_recovery_codes(user_id, code_hash);

create table public.idempotency_keys (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key             text not null,
  endpoint        text not null, -- ex: 'POST /api/v1/leads'
  request_hash    bytea not null, -- sha256 do body normalizado
  status_code     integer,        -- null = RESERVA (efeito em curso)
  response_body   jsonb,          -- null junto com status_code; nunca um só
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '24 hours',
  unique (organization_id, key, endpoint),
  constraint idempotency_keys_recibo_ou_reserva
    check ((status_code is null) = (response_body is null))
);

-- Nota: roda como service_role com `bypassed_rls=true` no audit
begin;

-- 1. Anonimiza o contact (L-04: irreversível)
update public.contacts
set
  full_name      = 'Cliente Anonimizado #' || substr(id::text, 1, 8),
  email          = null,
  phone_number   = null,
  cpf_encrypted  = null,
  is_anonymized  = true,
  anonymized_at  = now(),
  consent        = '{}'::jsonb,
  metadata       = jsonb_build_object('anonymization_request_id', :req_id)
where id = :contact_id and organization_id = :org_id;

-- 2. Conversations: preserva timeline, mas remove dados pessoais em metadata
update public.conversations
set metadata = metadata - 'contact_full_name' - 'contact_phone'
where contact_id = :contact_id;

-- 3. Messages: remove mídia do storage (em worker separado), limpa campos sensíveis
update public.messages
set
  body_text    = case
                   when type='text' then '[mensagem anonimizada]'
                   else body_text
                 end,
  media_url    = null,
  media_thumb  = null,
  metadata     = metadata - 'sender_name' - 'sender_phone'
where conversation_id in (
  select id from public.conversations where contact_id = :contact_id
);

-- 4. Activities: preserva timestamp/type/lead linkage; limpa metadata sensível
update public.crm_lead_activities
set metadata = metadata - 'contact_full_name' - 'contact_phone' - 'contact_email' - 'cpf'
where lead_id in (
  select id from public.crm_leads where contact_id = :contact_id
);

-- 5. Audit final (NÃO toca em api_audit_log — é append-only)
insert into public.api_audit_log (organization_id, action, resource_type, resource_id, actor_user_id, metadata)
values (:org_id, 'lgpd.redact_executed', 'contact', :contact_id, :approved_by,
        jsonb_build_object(
          'mode','anonymize',
          'cascaded_to', jsonb_build_object(
            'conversations', :conv_count,
            'messages', :msg_count,
            'activities', :act_count
          ),
          'request_id', :req_id
        ));

commit;

create or replace function public.fn_seed_default_pipeline_for_org()
returns trigger language plpgsql
security definer
set search_path = public
as $$
declare
  v_pipeline_id uuid;
begin
  insert into public.crm_pipelines (organization_id, name, vocabulary, settings)
  values (new.id, 'Pedidos',
          jsonb_build_object('lead','Cliente','deal','Pedido','won','Pago','lost','Cancelado'),
          '{}'::jsonb)
  returning id into v_pipeline_id;

  insert into public.crm_stages (organization_id, pipeline_id, name, position, is_won, is_lost)
  values
    (new.id, v_pipeline_id, 'Carrinho abandonado', 1, false, false),
    (new.id, v_pipeline_id, 'Aguardando pagamento', 2, false, false),
    (new.id, v_pipeline_id, 'Pago', 3, false, false),
    (new.id, v_pipeline_id, 'Em separação', 4, false, false),
    (new.id, v_pipeline_id, 'Enviado', 5, false, false),
    (new.id, v_pipeline_id, 'Entregue', 6, true, false),
    (new.id, v_pipeline_id, 'Pós-venda', 7, false, false);

  return new;
end $$;

create trigger trg_seed_pipeline_after_org_insert
  after insert on public.organizations
  for each row execute function public.fn_seed_default_pipeline_for_org();

-- 1. Toda tabela tenant-aware tem RLS
select tablename from pg_tables
where schemaname = 'public'
  and tablename in ('organizations','user_organizations','api_tokens','api_audit_log','platform_admins')
  and rowsecurity = false;
-- esperado: 0 linhas

-- 2. api_audit_log NÃO aceita UPDATE/DELETE
select has_table_privilege('authenticated', 'public.api_audit_log', 'UPDATE');
-- esperado: false
select has_table_privilege('authenticated', 'public.api_audit_log', 'DELETE');
-- esperado: false

-- 3. fn_user_org_ids retorna conjunto vazio sem auth.uid()
select count(*) from public.fn_user_org_ids();
-- esperado: 0


-- ============================================================
-- 02-spec-customer-360.md
-- ============================================================

-- Pré-requisitos (já habilitados pela Spec 01):
-- create extension if not exists "pgcrypto";
-- create extension if not exists "pg_trgm";

create table public.contacts (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,

  -- Dados pessoais
  name                     text,
  display_name             text,
  email                    text,
  email_normalized         text generated always as (lower(trim(email))) stored,
  phone_number             text,                 -- E.164: ^\+\d{8,15}$
  cpf_encrypted            bytea,                -- pgp_sym_encrypt(cpf_digits, key)
  cpf_hash                 text,                 -- sha256(cpf_digits) p/ matching sem decrypt
  birthdate                date,

  -- Estado
  is_blocked               boolean not null default false,
  blocked_reason           text,                 -- 'stop_keyword' | 'manual' | 'lgpd' | ...
  blocked_at               timestamptz,
  is_anonymized            boolean not null default false,
  anonymized_at            timestamptz,
  is_merged_into           uuid references public.contacts(id) on delete set null,
  merged_at                timestamptz,

  -- Consentimento LGPD (regra L-05)
  consent                  jsonb not null default jsonb_build_object(
                             'marketing',     jsonb_build_object('granted_at', null, 'source', null, 'version', null),
                             'transactional', jsonb_build_object('granted_at', null, 'source', null, 'version', null),
                             'profiling',     jsonb_build_object('granted_at', null, 'source', null, 'version', null)
                           ),

  -- Tags livres
  tags                     text[] not null default '{}',

  -- Origem
  source                   text not null default 'manual',  -- whatsapp_inbound | nuvemshop | manual | api | import
  source_metadata          jsonb not null default '{}'::jsonb,

  -- Auditoria leve (a auditoria densa fica em api_audit_log)
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by_user_id       uuid,                 -- soft FK p/ auth.users
  last_activity_at         timestamptz,          -- denormalizado por trigger

  -- Constraints
  constraint contacts_phone_e164_format
    check (phone_number is null or phone_number ~ '^\+\d{8,15}$'),
  constraint contacts_email_format
    check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint contacts_cpf_consistency
    check ((cpf_encrypted is null) = (cpf_hash is null)),
  constraint contacts_anonymized_locked
    check (is_anonymized = false or (is_anonymized = true and anonymized_at is not null))
);

comment on table  public.contacts                is 'Pessoa física no escopo de um tenant. CPF criptografado at-rest (pgcrypto). is_anonymized é irreversível (regra L-04).';
comment on column public.contacts.email_normalized is 'Coluna gerada (lower+trim) usada por todo matching e unique constraint.';
comment on column public.contacts.cpf_encrypted   is 'Bytea com pgp_sym_encrypt(digits, current_setting(''app.cpf_key'')). Acesso via decrypt_cpf().';
comment on column public.contacts.cpf_hash        is 'SHA256 hex dos 11 dígitos. Único por tenant. Permite match sem decrypt.';
comment on column public.contacts.is_merged_into  is 'Tombstone de merge (§5.4). NULL = contact ativo. NOT NULL = perdedor de merge, redireciona p/ primary.';
comment on column public.contacts.last_activity_at is 'Denormalizado pela trigger fn_update_last_activity_at em insert de crm_lead_activities.';

-- Unique constraints por tenant (parciais pra ignorar nulls)
create unique index uniq_contacts_org_email
  on public.contacts (organization_id, email_normalized)
  where email_normalized is not null and is_merged_into is null;

create unique index uniq_contacts_org_phone
  on public.contacts (organization_id, phone_number)
  where phone_number is not null and is_merged_into is null;

create unique index uniq_contacts_org_cpf
  on public.contacts (organization_id, cpf_hash)
  where cpf_hash is not null and is_merged_into is null;

-- Indexes operacionais
create index idx_contacts_org_blocked
  on public.contacts (organization_id) where is_blocked = true;

create index idx_contacts_org_last_activity
  on public.contacts (organization_id, last_activity_at desc nulls last);

create index idx_contacts_tags_gin
  on public.contacts using gin (tags);

create index idx_contacts_consent_gin
  on public.contacts using gin (consent jsonb_path_ops);

-- Trigram pra busca por nome (opcional MVP; suportado pela extensão pg_trgm)
create index idx_contacts_org_name_trgm
  on public.contacts using gin (organization_id, name gin_trgm_ops);

-- updated_at automático
create trigger trg_contacts_updated_at
  before update on public.contacts
  for each row execute function public.fn_set_updated_at();

create or replace function public.decrypt_cpf(p_contact_id uuid)
returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_cipher bytea;
  v_org    uuid;
begin
  select cpf_encrypted, organization_id into v_cipher, v_org
    from public.contacts where id = p_contact_id;

  if v_cipher is null then return null; end if;

  -- Verifica se caller tem acesso ao tenant
  if not exists (
    select 1 from public.fn_user_org_ids() x where x.organization_id = v_org
  ) and not public.fn_is_platform_admin() then
    raise exception 'forbidden_org';
  end if;

  -- Audit: toda decrypt é registrada
  insert into public.api_audit_log (organization_id, actor_user_id, action, resource_type, resource_id, metadata)
  values (v_org, auth.uid(), 'contact.cpf_decrypted', 'contact', p_contact_id, jsonb_build_object('purpose', current_setting('app.decrypt_purpose', true)));

  return pgp_sym_decrypt(v_cipher, current_setting('app.cpf_key', true));
end$$;

comment on function public.decrypt_cpf(uuid) is
  'Decripta CPF com check de tenancy + audit obrigatório. Setar app.decrypt_purpose antes do call.';

create table public.crm_pipelines (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,

  name                text not null,
  slug                text not null,            -- ex: 'pedidos', 'suporte'
  description         text,
  is_default          boolean not null default false,
  is_archived         boolean not null default false,
  position            numeric not null default 1000,

  -- Vocabulary customizável (Sub-PRD 02 §3.7)
  vocabulary          jsonb not null default jsonb_build_object(
                        'lead',         'Cliente',
                        'lead_plural',  'Clientes',
                        'deal',         'Pedido',
                        'deal_plural',  'Pedidos',
                        'won',          'Pago',
                        'lost',         'Cancelado',
                        'stage',        'Etapa',
                        'stage_plural', 'Etapas'
                      ),

  -- Settings declarativos
  settings            jsonb not null default jsonb_build_object(
                        'fields',          '[]'::jsonb,        -- custom fields (§6)
                        'canonical_tags',  '[]'::jsonb,        -- whitelist opcional (§7 abaixo)
                        'lost_reasons',    '[]'::jsonb,        -- override de lost_reasons (§8.3)
                        'identity_resolution', jsonb_build_object(
                          'fields_in_priority_order', jsonb_build_array('cpf','phone_e164','email')
                        )
                      ),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint crm_pipelines_slug_format check (slug ~ '^[a-z0-9_-]{2,40}$')
);

create unique index uniq_crm_pipelines_org_slug
  on public.crm_pipelines (organization_id, slug);

create unique index uniq_crm_pipelines_org_default
  on public.crm_pipelines (organization_id) where is_default = true;

create index idx_crm_pipelines_org_position
  on public.crm_pipelines (organization_id, position) where is_archived = false;

create trigger trg_crm_pipelines_updated_at
  before update on public.crm_pipelines
  for each row execute function public.fn_set_updated_at();

comment on column public.crm_pipelines.vocabulary is
  'Mapeia rótulos canônicos (lead/deal/won/lost/stage) p/ termos do nicho. UI consome via usePipelineVocabulary (§7.2).';
comment on column public.crm_pipelines.settings is
  'Schema declarativo: settings.fields[] = custom fields; settings.canonical_tags[] = whitelist opcional; settings.lost_reasons[] = override; settings.identity_resolution = config matching.';

create table public.crm_stages (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  pipeline_id         uuid not null references public.crm_pipelines(id) on delete cascade,

  name                text not null,
  slug                text not null,            -- ex: 'aguardando_pagamento', 'pago'
  description         text,
  position            numeric not null,         -- fractional indexing entre stages
  color               text,                     -- hex '#RRGGBB' p/ UI

  is_won              boolean not null default false,  -- mover lead aqui → status='won'
  is_lost             boolean not null default false,  -- mover lead aqui → status='lost'
  is_archived         boolean not null default false,

  -- Telemetria opcional (alvo de SLA por stage)
  expected_duration_hours numeric,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint crm_stages_won_lost_mutex
    check (not (is_won and is_lost)),
  constraint crm_stages_slug_format
    check (slug ~ '^[a-z0-9_-]{2,40}$'),
  constraint crm_stages_color_format
    check (color is null or color ~ '^#[0-9a-fA-F]{6}$')
);

create unique index uniq_crm_stages_pipeline_slug
  on public.crm_stages (pipeline_id, slug);

create index idx_crm_stages_pipeline_position
  on public.crm_stages (pipeline_id, position) where is_archived = false;

-- Apenas 1 stage `is_won` e 1 `is_lost` por pipeline (relaxável; ver §8)
create unique index uniq_crm_stages_pipeline_won
  on public.crm_stages (pipeline_id) where is_won = true and is_archived = false;

create unique index uniq_crm_stages_pipeline_lost
  on public.crm_stages (pipeline_id) where is_lost = true and is_archived = false;

create trigger trg_crm_stages_updated_at
  before update on public.crm_stages
  for each row execute function public.fn_set_updated_at();

create table public.crm_leads (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  pipeline_id         uuid not null references public.crm_pipelines(id) on delete restrict,
  stage_id            uuid not null references public.crm_stages(id)    on delete restrict,
  contact_id          uuid     references public.contacts(id)            on delete set null,

  title               text not null,
  description         text,

  status              text not null default 'open',  -- open | won | lost
  lost_reason         text,                          -- obrigatório quando status='lost' (regra P-03)

  -- Posição (fractional indexing)
  position_in_stage   numeric not null default 1000,

  -- Valor
  value_cents         bigint,
  currency            text default 'BRL',

  -- Atribuição
  owner_user_id       uuid,                          -- soft FK auth.users
  assigned_at         timestamptz,

  -- Timeline denormalizada
  last_activity_at    timestamptz,                   -- denorm via trigger
  expected_close_date date,
  closed_at           timestamptz,

  -- Origem polimórfica
  source              text not null default 'manual',
  source_metadata     jsonb not null default '{}'::jsonb,
  external_id         text,                          -- p/ idempotência cross-source (regra W-05 análoga)

  -- Custom fields declarativos (§6)
  custom_fields       jsonb not null default '{}'::jsonb,

  -- Tags
  tags                text[] not null default '{}',

  -- Auditoria leve
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by_user_id  uuid,

  constraint crm_leads_status_enum
    check (status in ('open','won','lost')),
  constraint crm_leads_currency_iso
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint crm_leads_lost_reason_required
    check (status <> 'lost' or (lost_reason is not null and length(lost_reason) > 0)),
  constraint crm_leads_closed_at_consistency
    check (
      (status = 'open'  and closed_at is null) or
      (status in ('won','lost') and closed_at is not null)
    )
);

-- Idempotência cross-source (P-08): mesma origem + mesmo external_id = mesmo lead
create unique index uniq_crm_leads_org_source_external
  on public.crm_leads (organization_id, source, external_id)
  where external_id is not null;

-- Indexes operacionais (cobrindo filters comuns)
create index idx_crm_leads_org_pipeline_status
  on public.crm_leads (organization_id, pipeline_id, status);

create index idx_crm_leads_org_stage_position
  on public.crm_leads (organization_id, stage_id, position_in_stage);

create index idx_crm_leads_org_owner_status
  on public.crm_leads (organization_id, owner_user_id, status)
  where status = 'open';

create index idx_crm_leads_org_contact
  on public.crm_leads (organization_id, contact_id);

create index idx_crm_leads_org_last_activity
  on public.crm_leads (organization_id, last_activity_at desc nulls last);

create index idx_crm_leads_org_expected_close_overdue
  on public.crm_leads (organization_id, expected_close_date)
  where status = 'open' and expected_close_date is not null;

create index idx_crm_leads_custom_fields_gin
  on public.crm_leads using gin (custom_fields jsonb_path_ops);

create index idx_crm_leads_tags_gin
  on public.crm_leads using gin (tags);

create trigger trg_crm_leads_updated_at
  before update on public.crm_leads
  for each row execute function public.fn_set_updated_at();

comment on column public.crm_leads.position_in_stage is
  'Fractional indexing (regra P-05). NUNCA usar int. Mover via midpoint(prev, next) sem reescrever vizinhos.';
comment on column public.crm_leads.custom_fields is
  'Valores governados por crm_pipelines.settings.fields[]. Validação via Zod gerado dinamicamente (§6).';

create or replace function public.midpoint(p_prev numeric, p_next numeric)
returns numeric language sql immutable as $$
  select case
    when p_prev is null and p_next is null then 1000::numeric
    when p_prev is null then p_next - 1
    when p_next is null then p_prev + 1
    else (p_prev + p_next) / 2
  end
$$;
comment on function public.midpoint(numeric, numeric) is
  'Calcula posição entre dois cards. Usado por API /leads/:id/move.';

create table public.crm_lead_activities (
  id                  uuid not null default gen_random_uuid(),
  organization_id     uuid not null,
  lead_id             uuid not null,
  contact_id          uuid,                  -- conveniência (denorm a partir do lead)

  -- Polimorfismo explícito (referência §3 do bundle)
  source_module       text not null,         -- 'whatsapp' | 'nuvemshop' | 'crm' | 'ai' | 'system' | 'lgpd'
  source_id           uuid,                  -- ex: messages.id, orders.id
  type                text not null,         -- catálogo canônico (§10)

  payload             jsonb not null default '{}'::jsonb,
  metadata            jsonb not null default '{}'::jsonb,

  performed_at        timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  performed_by_user_id uuid,                 -- quem agiu (atendente, super-admin, system=null)

  primary key (id, performed_at)
) partition by range (performed_at);

comment on table public.crm_lead_activities is
  'Timeline append-only polimórfica. Particionada por mês. Activities NÃO disparam HTTP (anti-pattern §9 bundle); emitem evento via fn_emit_event_on_lead_change.';

-- Partição default (segura) — partições mensais criadas por job (§11)
create table public.crm_lead_activities_default
  partition of public.crm_lead_activities default;

-- Indexes nas partições (criados por template ao gerar partição mensal)
-- Template:
--   create index on <part> (organization_id, lead_id, performed_at desc);
--   create index on <part> (organization_id, type, performed_at desc);
--   create index on <part> (organization_id, contact_id, performed_at desc);
--   create index on <part> using gin (payload jsonb_path_ops);

-- Soft FK constraint (em particionada, FK é mais cara; usamos trigger de validação leve)
create or replace function public.fn_validate_activity_lead_org()
returns trigger language plpgsql as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.crm_leads where id = new.lead_id;
  if v_org is null then
    raise exception 'lead_not_found' using errcode = '23503';
  end if;
  if v_org <> new.organization_id then
    raise exception 'lead_org_mismatch' using errcode = '23514';
  end if;
  return new;
end$$;

create trigger trg_validate_activity_lead_org
  before insert on public.crm_lead_activities
  for each row execute function public.fn_validate_activity_lead_org();

-- Append-only: revogar UPDATE/DELETE do role da app
revoke update, delete on public.crm_lead_activities from authenticated, anon;

create table public.crm_lead_links (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  lead_id           uuid not null references public.crm_leads(id)     on delete cascade,

  target_kind       text not null,          -- 'order' | 'conversation' | 'message' | 'appointment' | ...
  target_id         uuid not null,
  link_kind         text not null,          -- 'primary' | 'related' | 'duplicate_of' | 'merged_from' | ...

  metadata          jsonb not null default '{}'::jsonb,

  created_at        timestamptz not null default now(),
  created_by_user_id uuid,

  constraint crm_lead_links_target_kind_enum
    check (target_kind in ('order','conversation','message','appointment','contact','lead','external'))
);

create unique index uniq_crm_lead_links_lead_target_link
  on public.crm_lead_links (lead_id, target_kind, target_id, link_kind);

create index idx_crm_lead_links_org_target
  on public.crm_lead_links (organization_id, target_kind, target_id);

create index idx_crm_lead_links_lead
  on public.crm_lead_links (lead_id);

create table public.merge_queue (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,

  candidates        uuid[] not null,        -- array de contacts.id, len ≥ 2
  reason            text not null,          -- 'identity_ambiguous' | 'manual_request' | 'cross_source_collision'
  trigger_payload   jsonb not null default '{}'::jsonb,  -- snapshot do input que gerou ambiguidade

  status            text not null default 'pending',  -- pending | resolved | discarded
  resolution        jsonb,                  -- {action: 'merged_into', primary_id, losers, audit_id}
  resolved_by_user_id uuid,
  resolved_at       timestamptz,

  created_at        timestamptz not null default now(),

  constraint merge_queue_status_enum
    check (status in ('pending','resolved','discarded')),
  constraint merge_queue_candidates_min2
    check (array_length(candidates, 1) >= 2)
);

create index idx_merge_queue_org_status
  on public.merge_queue (organization_id, status, created_at);

-- Template (repetido por tabela)
alter table public.contacts             enable row level security;
alter table public.crm_pipelines        enable row level security;
alter table public.crm_stages           enable row level security;
alter table public.crm_leads            enable row level security;
alter table public.crm_lead_activities  enable row level security;
alter table public.crm_lead_links       enable row level security;
alter table public.merge_queue          enable row level security;

-- Exemplo (replicar substituindo <T>):
create policy "tenant_isolation_contacts_all" on public.contacts for all
  using  (organization_id in (select organization_id from public.fn_user_org_ids())
          or public.fn_is_platform_admin())
  with check
         (organization_id in (select organization_id from public.fn_user_org_ids())
          or public.fn_is_platform_admin());

-- crm_lead_activities: SELECT/INSERT only (UPDATE/DELETE revogado em §2.5)
create policy "tenant_isolation_crm_lead_activities_select" on public.crm_lead_activities for select
  using  (organization_id in (select organization_id from public.fn_user_org_ids())
          or public.fn_is_platform_admin());

create policy "tenant_isolation_crm_lead_activities_insert" on public.crm_lead_activities for insert
  with check
         (organization_id in (select organization_id from public.fn_user_org_ids())
          or public.fn_is_platform_admin());

-- merge_queue: agent não vê (apenas manager+)
create policy "tenant_isolation_merge_queue_select_manager" on public.merge_queue for select
  using  ((organization_id in (select organization_id from public.fn_user_org_ids()) and public.fn_user_role_in(organization_id) >= 3)
          or public.fn_is_platform_admin());

create policy "tenant_isolation_merge_queue_write_manager" on public.merge_queue for all
  using  ((organization_id in (select organization_id from public.fn_user_org_ids()) and public.fn_user_role_in(organization_id) >= 3)
          or public.fn_is_platform_admin())
  with check
         ((organization_id in (select organization_id from public.fn_user_org_ids()) and public.fn_user_role_in(organization_id) >= 3)
          or public.fn_is_platform_admin());

create or replace function public.fn_crm_lead_close_on_stage()
returns trigger language plpgsql as $$
declare
  v_stage record;
  v_old_status text;
begin
  if (tg_op = 'UPDATE' and new.stage_id is not distinct from old.stage_id)
     and (tg_op = 'UPDATE' and new.status   is not distinct from old.status) then
    return new;
  end if;

  select is_won, is_lost into v_stage
    from public.crm_stages where id = new.stage_id;

  v_old_status := coalesce(old.status, 'open');

  if v_stage.is_won then
    new.status    := 'won';
    new.closed_at := coalesce(new.closed_at, now());
  elsif v_stage.is_lost then
    new.status    := 'lost';
    new.closed_at := coalesce(new.closed_at, now());
  else
    -- Reabertura (regra P-04)
    if v_old_status in ('won','lost') then
      new.status    := 'open';
      new.closed_at := null;
    end if;
  end if;
  return new;
end$$;

create trigger trg_crm_lead_close_on_stage
  before insert or update of stage_id on public.crm_leads
  for each row execute function public.fn_crm_lead_close_on_stage();

create or replace function public.fn_update_last_activity_at()
returns trigger language plpgsql as $$
begin
  update public.crm_leads
     set last_activity_at = greatest(coalesce(last_activity_at, '-infinity'::timestamptz), new.performed_at)
   where id = new.lead_id;

  if new.contact_id is not null then
    update public.contacts
       set last_activity_at = greatest(coalesce(last_activity_at, '-infinity'::timestamptz), new.performed_at)
     where id = new.contact_id;
  end if;

  return new;
end$$;

create trigger trg_update_last_activity_at
  after insert on public.crm_lead_activities
  for each row execute function public.fn_update_last_activity_at();

create or replace function public.fn_emit_event_on_lead_change()
returns trigger language plpgsql as $$
declare
  v_event text;
  v_payload jsonb;
begin
  if tg_op = 'INSERT' then
    v_event := 'lead.created';
    v_payload := jsonb_build_object('lead_id', new.id, 'pipeline_id', new.pipeline_id, 'stage_id', new.stage_id, 'contact_id', new.contact_id, 'source', new.source);

  elsif tg_op = 'UPDATE' then
    if new.stage_id is distinct from old.stage_id then
      v_event := 'lead.stage_changed';
      v_payload := jsonb_build_object('lead_id', new.id, 'from_stage_id', old.stage_id, 'to_stage_id', new.stage_id);
      perform public.fn_log_event(new.organization_id, v_event, v_payload);
    end if;

    if new.status is distinct from old.status then
      if new.status = 'won' then
        v_event := 'lead.won';
      elsif new.status = 'lost' then
        v_event := 'lead.lost';
        v_payload := jsonb_build_object('lead_id', new.id, 'lost_reason', new.lost_reason);
      else
        v_event := 'lead.reopened';
      end if;
      v_payload := coalesce(v_payload, jsonb_build_object('lead_id', new.id, 'status', new.status));
      perform public.fn_log_event(new.organization_id, v_event, v_payload);
      return new;
    end if;

    if new.owner_user_id is distinct from old.owner_user_id then
      v_event := 'lead.assigned';
      v_payload := jsonb_build_object('lead_id', new.id, 'from_user_id', old.owner_user_id, 'to_user_id', new.owner_user_id);
    end if;
  end if;

  if v_event is not null then
    perform public.fn_log_event(new.organization_id, v_event, v_payload);
  end if;
  return new;
end$$;

create trigger trg_emit_event_on_lead_change
  after insert or update on public.crm_leads
  for each row execute function public.fn_emit_event_on_lead_change();

create or replace function public.fn_seed_default_pipeline_for_org()
returns trigger language plpgsql as $$
declare
  v_pipeline_id uuid;
  v_stage record;
  v_position numeric := 1000;
begin
  insert into public.crm_pipelines (organization_id, name, slug, is_default, position)
  values (new.id, 'Pedidos', 'pedidos', true, 1000)
  returning id into v_pipeline_id;

  for v_stage in
    select * from (values
      ('Carrinho abandonado',      'carrinho_abandonado',      false, false),
      ('Aguardando pagamento',     'aguardando_pagamento',     false, false),
      ('Pago',                     'pago',                     true,  false),
      ('Em separação',             'em_separacao',             false, false),
      ('Enviado',                  'enviado',                  false, false),
      ('Entregue',                 'entregue',                 false, false),
      ('Pós-venda',                'pos_venda',                false, false),
      ('Cancelado',                'cancelado',                false, true)
    ) as t(name, slug, is_won, is_lost)
  loop
    insert into public.crm_stages (organization_id, pipeline_id, name, slug, position, is_won, is_lost)
    values (new.id, v_pipeline_id, v_stage.name, v_stage.slug, v_position, v_stage.is_won, v_stage.is_lost);
    v_position := v_position + 1000;
  end loop;

  return new;
end$$;

create trigger trg_seed_default_pipeline_for_org
  after insert on public.organizations
  for each row execute function public.fn_seed_default_pipeline_for_org();

create or replace function public.fn_validate_lost_reason_required()
returns trigger language plpgsql as $$
declare
  v_canonical text[] := array['requested_by_customer','price','no_response','product_unavailable',
                              'cancelled_by_store','cancelled_by_customer','payment_failed','other'];
  v_pipeline_extra text[];
begin
  if new.status = 'lost' then
    if new.lost_reason is null or length(new.lost_reason) = 0 then
      raise exception 'lost_reason_required' using errcode = '22023';
    end if;

    select coalesce(
      array(select jsonb_array_elements_text(settings->'lost_reasons')), '{}'::text[]
    ) into v_pipeline_extra
    from public.crm_pipelines where id = new.pipeline_id;

    if not (new.lost_reason = any (v_canonical) or new.lost_reason = any (v_pipeline_extra)) then
      raise exception 'lost_reason_invalid: %', new.lost_reason using errcode = '22023';
    end if;
  end if;
  return new;
end$$;

create trigger trg_validate_lost_reason_required
  before insert or update of status, lost_reason on public.crm_leads
  for each row execute function public.fn_validate_lost_reason_required();

alter table public.crm_leads
  add column cf_tamanho_preferido text
  generated always as (custom_fields->>'tamanho_preferido') stored;

create index idx_crm_leads_cf_tamanho_preferido
  on public.crm_leads (organization_id, cf_tamanho_preferido)
  where cf_tamanho_preferido is not null;

-- Exemplo de partição mensal
create table public.crm_lead_activities_2026_05
  partition of public.crm_lead_activities
  for values from ('2026-05-01 00:00:00+00') to ('2026-06-01 00:00:00+00');

-- Aplicar indexes via template
create index on public.crm_lead_activities_2026_05 (organization_id, lead_id, performed_at desc);
create index on public.crm_lead_activities_2026_05 (organization_id, type, performed_at desc);
create index on public.crm_lead_activities_2026_05 (organization_id, contact_id, performed_at desc);
create index on public.crm_lead_activities_2026_05 using gin (payload jsonb_path_ops);


-- ============================================================
-- 03-spec-whatsapp-waha.md
-- ============================================================

create table public.channel_sessions (
  id                       uuid primary key default uuid_generate_v4(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,

  -- Identificação WAHA
  waha_session_name        text not null,
  -- formato: 'org_<org_id>_<seq>' (ex: 'org_a1b2c3d4_1')
  -- precisa ser único GLOBALMENTE (regra implícita do WAHA, 1 instância compartilhada)
  engine                   text not null default 'NOWEB'
                           check (engine in ('NOWEB','WEBJS')),

  -- Webhook (T-07)
  webhook_path_token       text not null default replace(uuid_generate_v4()::text,'-',''),
  webhook_secret_encrypted bytea not null,
  -- AES-GCM via pgcrypto; chave WEBHOOK_SECRET_ENCRYPTION_KEY em env

  -- Estado
  status                   text not null default 'STARTING'
                           check (status in (
                             'STARTING','SCAN_QR_CODE','WORKING',
                             'STOPPED','FAILED'
                           )),
  status_reason            text,
  phone_number             text,                 -- E.164, populado após WORKING
  display_name             text,                 -- nome do perfil WhatsApp

  -- Health
  last_health_check_at     timestamptz,
  last_status_change_at    timestamptz not null default now(),
  consecutive_health_fails integer not null default 0,

  -- Operacional
  daily_message_limit      integer not null default 300,  -- W-06
  warmup_started_at        timestamptz,
  warmup_completed_at      timestamptz,
  is_warmup_complete       boolean generated always as (
                             warmup_completed_at is not null
                           ) stored,

  -- Metadata flexível
  metadata                 jsonb not null default '{}'::jsonb,

  -- Auditoria
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid references auth.users(id),

  constraint channel_sessions_waha_session_name_unique unique (waha_session_name),
  constraint channel_sessions_webhook_path_token_unique unique (webhook_path_token),
  constraint channel_sessions_phone_per_org_unique unique (organization_id, phone_number)
                                                  deferrable initially deferred
);

create index idx_channel_sessions_org_status
  on public.channel_sessions (organization_id, status);
create index idx_channel_sessions_health
  on public.channel_sessions (last_health_check_at)
  where status = 'WORKING';

alter table public.channel_sessions enable row level security;

create policy "channel_sessions_tenant_isolation_all"
  on public.channel_sessions for all
  using (organization_id in (select organization_id from public.fn_user_org_ids()))
  with check (organization_id in (select organization_id from public.fn_user_org_ids()));

create trigger trg_channel_sessions_updated_at
  before update on public.channel_sessions
  for each row execute function public.fn_set_updated_at();

create trigger trg_channel_sessions_status_audit
  after update of status on public.channel_sessions
  for each row when (old.status is distinct from new.status)
  execute function public.fn_emit_channel_session_status_changed();

create table public.channel_session_warmup (
  id                  uuid primary key default uuid_generate_v4(),
  channel_session_id  uuid not null references public.channel_sessions(id) on delete cascade,
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  day                 date not null,
  messages_sent       integer not null default 0,
  messages_received   integer not null default 0,
  unique_contacts     integer not null default 0,

  constraint warmup_session_day_unique unique (channel_session_id, day)
);

create index idx_warmup_org_day on public.channel_session_warmup (organization_id, day desc);

alter table public.channel_session_warmup enable row level security;
create policy "warmup_tenant_isolation_all"
  on public.channel_session_warmup for all
  using (organization_id in (select organization_id from public.fn_user_org_ids()))
  with check (organization_id in (select organization_id from public.fn_user_org_ids()));

create table public.conversations (
  id                          uuid primary key default uuid_generate_v4(),
  organization_id             uuid not null references public.organizations(id) on delete cascade,

  contact_id                  uuid not null references public.contacts(id) on delete restrict,
  channel_session_id          uuid not null references public.channel_sessions(id) on delete restrict,
  channel                     text not null default 'whatsapp'
                              check (channel in ('whatsapp')),  -- prep multi-canal

  status                      text not null default 'open'
                              check (status in ('open','pending','resolved')),
  status_changed_at           timestamptz not null default now(),

  assigned_to_user_id         uuid references auth.users(id) on delete set null,
  assigned_at                 timestamptz,

  last_inbound_at             timestamptz,
  last_outbound_at            timestamptz,
  last_message_at             timestamptz,
  last_message_preview        text,

  unread_count_for_assignee   integer not null default 0,

  is_group                    boolean not null default false,  -- W-09
  group_chat_id               text,                            -- @g.us se grupo

  metadata                    jsonb not null default '{}'::jsonb,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint conversations_unique_per_contact_session
    unique (organization_id, contact_id, channel_session_id, group_chat_id)
);

create index idx_conversations_org_last_msg
  on public.conversations (organization_id, last_message_at desc nulls last);
create index idx_conversations_assigned
  on public.conversations (assigned_to_user_id, status)
  where assigned_to_user_id is not null;
create index idx_conversations_open_unassigned
  on public.conversations (organization_id, last_inbound_at desc)
  where status = 'open' and assigned_to_user_id is null;

alter table public.conversations enable row level security;
create policy "conversations_tenant_isolation_all"
  on public.conversations for all
  using (organization_id in (select organization_id from public.fn_user_org_ids()))
  with check (organization_id in (select organization_id from public.fn_user_org_ids()));

create trigger trg_conversations_updated_at
  before update on public.conversations
  for each row execute function public.fn_set_updated_at();

create table public.messages (
  id                  uuid primary key default uuid_generate_v4(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,

  conversation_id     uuid not null references public.conversations(id) on delete cascade,
  channel_session_id  uuid not null references public.channel_sessions(id) on delete restrict,
  contact_id          uuid not null references public.contacts(id) on delete restrict,

  -- Identidade WAHA
  external_id         text,    -- nullable: outbound em sending ainda não tem ID
  type                text not null
                      check (type in (
                        'text','image','video','audio','document',
                        'sticker','location','contact','reaction','system'
                      )),
  direction           text not null check (direction in ('inbound','outbound')),

  -- Status (W-12)
  status              text not null default 'received'
                      check (status in (
                        'received',
                        'sending','sent','delivered','read','failed'
                      )),
  ack                 integer,    -- WAHA: -1 error, 0 pending, 1 server, 2 device, 3 read, 4 played
  error_code          text,
  error_message       text,

  -- Conteúdo
  body                text,
  media_url           text,        -- URL assinada do Supabase Storage
  media_mime          text,
  media_size_bytes    bigint,
  media_storage_path  text,        -- path canônico no bucket

  -- Origem (W-10)
  sent_via            text not null default 'crm'
                      check (sent_via in ('crm','external_device','automation','ai')),
  sent_by_user_id     uuid references auth.users(id) on delete set null,

  -- Timestamps WhatsApp (W8 — ordenar por sent_at)
  sent_at             timestamptz not null default now(),
  delivered_at        timestamptz,
  read_at             timestamptz,

  -- Idempotência & metadata
  metadata            jsonb not null default '{}'::jsonb,

  -- Polimorfismo de timeline (vide Sub-PRD 02)
  activity_id         uuid references public.crm_lead_activities(id) on delete set null,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Idempotência forte (W-05). Deferrable pra permitir update do
  -- external_id no commit (envio: insert sem ID, update após WAHA retornar).
  constraint messages_org_external_id_unique
    unique (organization_id, external_id)
    deferrable initially deferred
);

create index idx_messages_conversation_sent
  on public.messages (conversation_id, sent_at desc);
create index idx_messages_org_status_created
  on public.messages (organization_id, status, created_at)
  where status in ('sending','failed');
create index idx_messages_external_lookup
  on public.messages (organization_id, external_id)
  where external_id is not null;

alter table public.messages enable row level security;
create policy "messages_tenant_isolation_all"
  on public.messages for all
  using (organization_id in (select organization_id from public.fn_user_org_ids()))
  with check (organization_id in (select organization_id from public.fn_user_org_ids()));

create trigger trg_messages_updated_at
  before update on public.messages
  for each row execute function public.fn_set_updated_at();

-- Trigger NUNCA faz HTTP — apenas escreve em event_log (Sub-PRD 01)
create trigger trg_messages_emit_event
  after insert on public.messages
  for each row execute function public.fn_emit_message_event();

create table public.webhook_events_log (
  id                   uuid primary key default uuid_generate_v4(),
  organization_id      uuid,                                   -- nullable: pode falhar antes de resolver
  channel_session_id   uuid references public.channel_sessions(id) on delete set null,

  webhook_path_token   text,
  http_method          text not null default 'POST',
  headers              jsonb,
  raw_body             text not null,                          -- corpo CRU (pra HMAC re-check)
  payload_parsed       jsonb,

  signature_header     text,
  valid_signature      boolean,

  event_type           text,        -- 'message','message.any','message.ack','session.status', etc.
  external_id          text,        -- pra debug/idempotência

  status               text not null default 'received'
                       check (status in ('received','processed','error','dead')),
  attempts             integer not null default 0,
  error_message        text,
  processed_at         timestamptz,

  received_at          timestamptz not null default now(),
  archived_at          timestamptz
);

create index idx_webhook_events_status_received
  on public.webhook_events_log (status, received_at)
  where status in ('received','error');
create index idx_webhook_events_org_received
  on public.webhook_events_log (organization_id, received_at desc);
create index idx_webhook_events_external_id
  on public.webhook_events_log (organization_id, external_id)
  where external_id is not null;

-- RLS: super-admin lê tudo; tenant lê apenas o seu (via app, com filtro manual)
alter table public.webhook_events_log enable row level security;
create policy "webhook_events_log_tenant_read"
  on public.webhook_events_log for select
  using (
    organization_id is not null
    and organization_id in (select organization_id from public.fn_user_org_ids())
  );
-- INSERT/UPDATE: apenas service role (handler de webhook)
revoke insert, update, delete on public.webhook_events_log from anon, authenticated;

create policy "messages_agent_insert_own_conversation"
  on public.messages for insert
  to authenticated
  with check (
    organization_id in (select organization_id from public.fn_user_org_ids())
    and (
      auth.jwt() ->> 'role' in ('manager','admin')
      or exists (
        select 1 from public.conversations c
        where c.id = messages.conversation_id
          and c.assigned_to_user_id = auth.uid()
      )
    )
  );

-- Sanity: RLS ativa em todas
select tablename, rowsecurity from pg_tables
 where schemaname = 'public'
   and tablename in ('channel_sessions','channel_session_warmup',
                     'conversations','messages','webhook_events_log')
   and rowsecurity = false;
-- expect: 0 rows

-- Sanity: indexes esperados existem
select indexname from pg_indexes where schemaname = 'public'
  and indexname in (
    'idx_messages_conversation_sent',
    'idx_messages_org_status_created',
    'idx_conversations_open_unassigned',
    'idx_channel_sessions_health'
  );
-- expect: 4 rows


-- ============================================================
-- 04-spec-pipeline-attendance.md
-- ============================================================

UPDATE conversations
SET assigned_to_user_id = $caller, updated_at = now()
WHERE id = $conv AND assigned_to_user_id IS NULL
RETURNING *;


-- ============================================================
-- 05-spec-ai-rag-handoff.md
-- ============================================================

create table public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  name text not null,
  description text,
  is_active boolean not null default true,
  is_default boolean not null default false,

  -- Modelo & invocação
  model text not null default 'anthropic/claude-sonnet-4-6',
  system_prompt text not null,

  -- Configuração de invocação (jsonb pra evolução sem migration)
  config jsonb not null default jsonb_build_object(
    'temperature', 0.3,
    'max_tokens', 1024,
    'rag_top_k', 5,
    'rag_similarity_threshold', 0.72,
    'context_message_window', 20,
    'confidence_threshold', 0.55,
    'sentiment_threshold', 0.3,
    'zero_data_retention', false
  ),

  -- Guardrails declarativos (formato em §8)
  guardrails jsonb not null default '[]'::jsonb,

  -- Versão da KB ativa (FK lógica pra ai_knowledge_versions)
  active_kb_version_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),

  constraint ai_agents_name_unique unique (organization_id, name),
  constraint ai_agents_one_default check (
    -- Garantido por trigger fn_ai_agents_enforce_single_default abaixo
    true
  )
);

create index ai_agents_org_active_idx on public.ai_agents (organization_id) where is_active;
create unique index ai_agents_one_default_per_org on public.ai_agents (organization_id) where is_default;

alter table public.ai_agents enable row level security;
create policy tenant_isolation_ai_agents_all on public.ai_agents for all
  using (organization_id in (select organization_id from public.fn_user_org_ids()))
  with check (organization_id in (select organization_id from public.fn_user_org_ids()));

create trigger trg_ai_agents_audit
  after insert or update or delete on public.ai_agents
  for each row execute function public.fn_audit_log_row();

create table public.ai_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.ai_agents(id) on delete cascade,

  source_type text not null check (source_type in ('faq', 'policy', 'catalog', 'conversations')),
  source_metadata jsonb not null default '{}'::jsonb,
  -- Para 'faq': { name, locale }
  -- Para 'policy': { filename, version, uploaded_by }
  -- Para 'catalog': { provider: 'nuvemshop', external_account_id }
  -- Para 'conversations': { criteria: 'resolved_with_flag' }

  is_active boolean not null default true,

  -- Telemetria
  last_indexed_at timestamptz,
  last_index_status text check (last_index_status in ('success', 'partial', 'failed')),
  last_index_error text,
  chunks_count integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_knowledge_sources_agent_idx on public.ai_knowledge_sources (agent_id, is_active);
create unique index ai_knowledge_sources_unique_per_agent
  on public.ai_knowledge_sources (agent_id, source_type)
  where is_active;

alter table public.ai_knowledge_sources enable row level security;
create policy tenant_isolation_ai_knowledge_sources_all on public.ai_knowledge_sources for all
  using (organization_id in (select organization_id from public.fn_user_org_ids()))
  with check (organization_id in (select organization_id from public.fn_user_org_ids()));

create extension if not exists vector;

create table public.ai_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  knowledge_source_id uuid not null references public.ai_knowledge_sources(id) on delete cascade,
  kb_version_id uuid not null,  -- FK lógica para ai_knowledge_versions

  position integer not null,
  content text not null,
  content_hash text not null,  -- sha256 hex pra dedup em re-indexação
  token_count integer not null,
  embedding vector(1536) not null,

  -- Metadados pra filtragem e citação
  metadata jsonb not null default '{}'::jsonb,
  -- Comum: { source_anchor: 'Política #troca', tags: ['frete','prazo'] }
  -- Catálogo: { product_id, product_name, sku, availability }
  -- Conversations: { conversation_id, resolved_at, anonymized: true }

  created_at timestamptz not null default now(),

  constraint ai_chunks_position_unique unique (knowledge_source_id, kb_version_id, position)
);

-- Index vetorial principal — ivfflat com lists=100 cobre até ~100k vetores por tenant
create index ai_chunks_embedding_ivfflat_idx
  on public.ai_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Filtros tenant-aware (todos os retrievals filtram org_id antes do KNN)
create index ai_chunks_org_kbv_idx on public.ai_chunks (organization_id, kb_version_id);
create index ai_chunks_source_idx on public.ai_chunks (knowledge_source_id);
create index ai_chunks_metadata_gin_idx on public.ai_chunks using gin (metadata);

alter table public.ai_chunks enable row level security;
create policy tenant_isolation_ai_chunks_all on public.ai_chunks for all
  using (organization_id in (select organization_id from public.fn_user_org_ids()))
  with check (organization_id in (select organization_id from public.fn_user_org_ids()));

create table public.ai_knowledge_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.ai_agents(id) on delete cascade,

  version_number integer not null,
  description text,
  is_active boolean not null default false,

  -- Snapshot de quais sources estavam ativos quando criada
  sources_snapshot jsonb not null default '[]'::jsonb,
  total_chunks integer not null default 0,

  created_at timestamptz not null default now(),
  activated_at timestamptz,
  activated_by uuid references auth.users(id),

  constraint ai_kbv_version_unique unique (agent_id, version_number)
);

create index ai_kbv_agent_active_idx on public.ai_knowledge_versions (agent_id) where is_active;
create unique index ai_kbv_one_active_per_agent on public.ai_knowledge_versions (agent_id) where is_active;

alter table public.ai_knowledge_versions enable row level security;
create policy tenant_isolation_ai_kbv_all on public.ai_knowledge_versions for all
  using (organization_id in (select organization_id from public.fn_user_org_ids()))
  with check (organization_id in (select organization_id from public.fn_user_org_ids()));

create table public.ai_invocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.ai_agents(id) on delete cascade,

  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  invocation_kind text not null check (invocation_kind in (
    'bot_respond', 'sentiment_classify', 'triage_classify', 'embedding_generate'
  )),

  model text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer generated always as (prompt_tokens + completion_tokens) stored,
  latency_ms integer not null,
  cost_cents numeric(10,4) not null default 0,
  finish_reason text,
  -- 'stop' | 'length' | 'guardrail_blocked' | 'error' | 'timeout'

  -- Citações de RAG (snapshot, não FK pra preservar mesmo após purge de chunks)
  citations jsonb not null default '[]'::jsonb,
  -- [{ chunk_id, source_type, source_id, score, kb_version_id }]

  -- Para debug; comprimido + retenção 90d hot, depois cold storage
  prompt_blob_path text,  -- caminho em Supabase Storage (bucket ai-logs)
  response_blob_path text,

  -- Erro estruturado (se finish_reason='error')
  error_payload jsonb,

  created_at timestamptz not null default now()
);

create index ai_invocations_org_created_idx on public.ai_invocations (organization_id, created_at desc);
create index ai_invocations_conversation_idx on public.ai_invocations (conversation_id) where conversation_id is not null;
create index ai_invocations_agent_kind_idx on public.ai_invocations (agent_id, invocation_kind);

alter table public.ai_invocations enable row level security;
create policy tenant_isolation_ai_invocations_all on public.ai_invocations for all
  using (organization_id in (select organization_id from public.fn_user_org_ids()))
  with check (organization_id in (select organization_id from public.fn_user_org_ids()));

create table public.ai_pricing (
  model text primary key,
  prompt_cents_per_million_tokens numeric(10,4) not null,
  completion_cents_per_million_tokens numeric(10,4) not null,
  embedding_cents_per_million_tokens numeric(10,4),
  effective_from timestamptz not null default now(),
  superseded_at timestamptz,
  notes text
);

-- Seed inicial (preços referência abr/2026; revisitar trimestralmente)
insert into public.ai_pricing (model, prompt_cents_per_million_tokens, completion_cents_per_million_tokens, embedding_cents_per_million_tokens) values
  ('anthropic/claude-sonnet-4-6', 300.00, 1500.00, null),
  ('anthropic/claude-haiku-4-5', 80.00, 400.00, null),
  ('openai/text-embedding-3-small', null, null, 2.00);

create table public.ai_budgets (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  monthly_limit_cents integer not null default 5000,  -- R$ 50/mês default
  action_at_100pct text not null default 'throttle' check (action_at_100pct in ('throttle', 'disable')),
  alarm_threshold_pct integer not null default 80 check (alarm_threshold_pct between 50 and 99),

  -- Estado runtime (atualizado em rolling window pelo trigger de ai_invocations)
  current_month_consumed_cents numeric(12,4) not null default 0,
  current_period_start date not null default date_trunc('month', now())::date,
  last_alarm_sent_at timestamptz,
  is_throttled boolean not null default false,
  is_disabled boolean not null default false,

  updated_at timestamptz not null default now()
);

alter table public.ai_budgets enable row level security;
create policy tenant_isolation_ai_budgets_all on public.ai_budgets for all
  using (organization_id in (select organization_id from public.fn_user_org_ids()))
  with check (organization_id in (select organization_id from public.fn_user_org_ids()));

-- Garantir que extensions existem
create extension if not exists vector;
create extension if not exists pg_trgm;  -- usado em fallback BM25 hybrid (§4.5)
create extension if not exists pgcrypto;

-- RPC para swap atômico
create or replace function public.activate_kb_version(p_agent_id uuid, p_version_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.ai_knowledge_versions set is_active = false
    where agent_id = p_agent_id and id <> p_version_id;
  update public.ai_knowledge_versions set is_active = true, activated_at = now()
    where id = p_version_id;
  update public.ai_agents set active_kb_version_id = p_version_id, updated_at = now()
    where id = p_agent_id;
end;
$$;

create or replace function public.retrieve_top_k_chunks(
  p_organization_id uuid,
  p_kb_version_id uuid,
  p_embedding vector(1536),
  p_k integer,
  p_threshold real
)
returns table (
  chunk_id uuid,
  content text,
  metadata jsonb,
  source_type text,
  knowledge_source_id uuid,
  score real
)
language sql stable security definer set search_path = public as $$
  select
    c.id as chunk_id,
    c.content,
    c.metadata,
    s.source_type,
    c.knowledge_source_id,
    1 - (c.embedding <=> p_embedding) as score
  from public.ai_chunks c
  join public.ai_knowledge_sources s on s.id = c.knowledge_source_id
  where c.organization_id = p_organization_id
    and c.kb_version_id = p_kb_version_id
    and s.is_active = true
    and (1 - (c.embedding <=> p_embedding)) >= p_threshold
  order by c.embedding <=> p_embedding
  limit p_k;
$$;

create or replace function public.fn_ai_invocation_update_budget()
returns trigger language plpgsql as $$
declare
  v_budget public.ai_budgets;
begin
  -- Reset mensal lazy
  update public.ai_budgets
    set current_month_consumed_cents = 0,
        current_period_start = date_trunc('month', now())::date,
        last_alarm_sent_at = null,
        is_throttled = false,
        is_disabled = false
    where organization_id = new.organization_id
      and current_period_start < date_trunc('month', now())::date;

  update public.ai_budgets
    set current_month_consumed_cents = current_month_consumed_cents + new.cost_cents,
        updated_at = now()
    where organization_id = new.organization_id
    returning * into v_budget;

  -- Alarme 80%
  if v_budget.current_month_consumed_cents >= v_budget.monthly_limit_cents * v_budget.alarm_threshold_pct / 100.0
     and v_budget.last_alarm_sent_at is null then
    insert into public.event_log (event_type, payload)
      values ('ai_budget.alarm_threshold_reached',
              jsonb_build_object('organization_id', new.organization_id, 'consumed_pct', 80));
    update public.ai_budgets set last_alarm_sent_at = now() where organization_id = new.organization_id;
  end if;

  -- Ação 100%
  if v_budget.current_month_consumed_cents >= v_budget.monthly_limit_cents then
    if v_budget.action_at_100pct = 'throttle' then
      update public.ai_budgets set is_throttled = true where organization_id = new.organization_id;
    else
      update public.ai_budgets set is_disabled = true where organization_id = new.organization_id;
    end if;
    insert into public.event_log (event_type, payload)
      values ('ai_budget.exhausted',
              jsonb_build_object('organization_id', new.organization_id, 'action', v_budget.action_at_100pct));
  end if;

  return new;
end;
$$;

create trigger trg_ai_invocation_update_budget
  after insert on public.ai_invocations
  for each row execute function public.fn_ai_invocation_update_budget();

alter table public.organizations add column ai_disabled boolean not null default false;

alter table public.contacts add column force_human boolean not null default false;


-- ============================================================
-- 06-spec-nuvemshop-lgpd.md
-- ============================================================

create extension if not exists pgcrypto;

create table public.tenant_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('nuvemshop', 'vtex', 'shopify')),

  -- OAuth credentials (encrypted with NUVEMSHOP_OAUTH_ENCRYPTION_KEY for provider='nuvemshop')
  oauth_access_token_encrypted bytea not null,
  oauth_refresh_token_encrypted bytea,
  scopes text[] not null default array[]::text[],
  expires_at timestamptz,

  status text not null default 'connecting'
    check (status in ('connecting', 'healthy', 'token_expired', 'scope_missing', 'disconnected', 'rate_limited', 'error')),
  status_reason text,

  -- Store metadata (non-secret): { store_id, store_name, plan_name, currency, country, ... }
  store_metadata jsonb not null default '{}'::jsonb,

  -- Webhook routing token (per tenant, per integration); rotatable via UI
  webhook_path_token text not null default encode(gen_random_bytes(24), 'hex'),
  webhook_secret_encrypted bytea not null, -- HMAC secret; rotatable

  -- Webhook subscriptions registered upstream
  webhook_subscriptions jsonb not null default '[]'::jsonb,
  -- shape: [{ event, external_subscription_id, url, subscribed_at }]

  last_sync_at timestamptz,
  last_health_check_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 1 active integration per (org, provider) for MVP
  unique (organization_id, provider)
);

create index tenant_integrations_org_idx on public.tenant_integrations (organization_id);
create index tenant_integrations_status_idx on public.tenant_integrations (status) where status in ('token_expired', 'error');
create index tenant_integrations_expires_idx on public.tenant_integrations (expires_at) where expires_at is not null;
create unique index tenant_integrations_path_token_idx on public.tenant_integrations (webhook_path_token);

alter table public.tenant_integrations enable row level security;

create policy tenant_integrations_select on public.tenant_integrations
  for select using (organization_id in (select fn_user_org_ids()));

create policy tenant_integrations_admin_write on public.tenant_integrations
  for all using (
    organization_id in (select fn_user_org_ids())
    and fn_user_role_in_org(organization_id) in ('admin', 'manager')
  );

-- Wrapper que usa pgsodium (preferido) ou pgcrypto + chave de env via Vault
create or replace function fn_encrypt_oauth(plaintext text)
returns bytea
language plpgsql
security definer
as $$
declare
  k text := current_setting('app.nuvemshop_oauth_key', true);
begin
  if k is null or length(k) < 32 then
    raise exception 'NUVEMSHOP_OAUTH_ENCRYPTION_KEY ausente';
  end if;
  return pgp_sym_encrypt(plaintext, k, 'cipher-algo=aes256');
end$$;

create or replace function fn_decrypt_oauth(ciphertext bytea)
returns text
language plpgsql
security definer
as $$
declare
  k text := current_setting('app.nuvemshop_oauth_key', true);
begin
  return pgp_sym_decrypt(ciphertext, k);
end$$;

revoke all on function fn_encrypt_oauth(text) from public;
revoke all on function fn_decrypt_oauth(bytea) from public;
grant execute on function fn_encrypt_oauth(text) to service_role;
grant execute on function fn_decrypt_oauth(bytea) to service_role;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  external_id text not null,
  external_provider text not null check (external_provider in ('nuvemshop', 'vtex', 'shopify')),

  -- linkage
  customer_external_id text,
  contact_id uuid references public.contacts(id) on delete set null,

  -- status mirror (not source of truth; lead is)
  status text not null check (status in ('pending', 'paid', 'cancelled', 'fulfilled', 'shipped', 'delivered', 'refunded')),
  total_cents bigint not null check (total_cents >= 0),
  currency char(3) not null default 'BRL',
  payment_method text,
  fulfillment_status text check (fulfillment_status in ('unpacked', 'packed', 'shipped', 'delivered')),
  tracking_code text,

  payload jsonb not null default '{}'::jsonb, -- last raw snapshot from provider (sanitized)
  ordered_at timestamptz not null,
  updated_at_remote timestamptz,

  is_anonymized boolean not null default false, -- L-04 cascade flag

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, external_provider, external_id)
);

create index orders_org_ordered_idx on public.orders (organization_id, ordered_at desc);
create index orders_contact_idx on public.orders (contact_id) where contact_id is not null;
create index orders_status_idx on public.orders (organization_id, status);
create index orders_customer_external_idx on public.orders (organization_id, external_provider, customer_external_id);
create index orders_payload_gin on public.orders using gin (payload jsonb_path_ops);

alter table public.orders enable row level security;

create policy orders_tenant_select on public.orders
  for select using (organization_id in (select fn_user_org_ids()));

create policy orders_tenant_write on public.orders
  for all using (organization_id in (select fn_user_org_ids()))
  with check (organization_id in (select fn_user_org_ids()));

create table public.nuvemshop_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  external_id text not null,

  title text not null,
  description text,
  price_cents bigint not null check (price_cents >= 0),
  available_qty integer not null default 0,
  url text,
  image_url text,

  -- For RAG ingestion pipeline (Sub-PRD 05); flag toggled by indexer worker
  rag_indexed_at timestamptz,
  rag_chunk_count integer not null default 0,

  payload jsonb not null default '{}'::jsonb,
  last_updated_at timestamptz not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, external_id)
);

create index nuvemshop_products_org_idx on public.nuvemshop_products (organization_id);
create index nuvemshop_products_rag_pending_idx on public.nuvemshop_products (organization_id)
  where rag_indexed_at is null;
create index nuvemshop_products_title_trgm on public.nuvemshop_products using gin (title gin_trgm_ops);

alter table public.nuvemshop_products enable row level security;

create policy nuvemshop_products_tenant on public.nuvemshop_products
  for all using (organization_id in (select fn_user_org_ids()))
  with check (organization_id in (select fn_user_org_ids()));

-- DEFINIDA EM 03-spec-whatsapp-waha.md; aqui apenas índices/constraints suplementares
-- Particionamento mensal por received_at.

-- Índice extra pra LGPD audit
create index if not exists webhook_events_log_lgpd_idx
  on public.webhook_events_log (organization_id, provider, event_type, received_at desc)
  where event_type in ('customer/redact', 'customer/data_request', 'store/redact');

-- Índice extra pra DLQ
create index if not exists webhook_events_log_dlq_idx
  on public.webhook_events_log (organization_id, provider)
  where status = 'dead_letter';

create table public.sync_progress (
  integration_id uuid not null references public.tenant_integrations(id) on delete cascade,
  domain text not null check (domain in ('products', 'customers', 'orders')),
  status text not null check (status in ('pending', 'running', 'completed', 'failed')),
  items_synced integer not null default 0,
  items_total integer,
  cursor text,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (integration_id, domain)
);

alter table public.sync_progress enable row level security;
create policy sync_progress_tenant on public.sync_progress
  for select using (
    integration_id in (select id from tenant_integrations where organization_id in (select fn_user_org_ids()))
  );

update webhook_events_log set
  status = case when attempt_count >= 7 then 'dead_letter' else 'failed' end,
  attempt_count = attempt_count + 1,
  last_attempt_at = now(),
  last_error = $err
where id = $id;


-- ============================================================
-- 07-spec-events-workers.md
-- ============================================================

create table public.event_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  event_type      text not null,                 -- ex: "lead.stage_changed"
  entity_kind     text not null,                 -- ex: "lead", "message", "order"
  entity_id       uuid,                          -- nullable (eventos system.* podem não ter)

  payload         jsonb not null default '{}'::jsonb,
  metadata        jsonb not null default '{}'::jsonb,
  -- metadata padrão: { request_id, actor_id, source, trace_id, idempotency_key, schema_version }

  consumed_by     text[] not null default '{}',  -- nomes de workers que já processaram
  attempts        smallint not null default 0,
  last_error      text,
  next_attempt_at timestamptz,                   -- backoff scheduling
  status          text not null default 'pending'
                  check (status in ('pending','processing','done','dead')),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint event_type_format
    check (event_type ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$')
);

comment on table public.event_log is
  'Bus interno do CRM. Triggers e ServerActions inserem aqui. Workers consomem.';

-- 1. Pull principal (workers): pendentes por org, ordem de criação
create index event_log_pending_idx
  on public.event_log (organization_id, created_at)
  where status = 'pending' and (next_attempt_at is null or next_attempt_at <= now());

-- 2. Por tipo de evento (filtro de worker específico)
create index event_log_org_type_idx
  on public.event_log (organization_id, event_type, created_at desc);

-- 3. DLQ inspection
create index event_log_dead_idx
  on public.event_log (organization_id, created_at desc)
  where status = 'dead';

-- 4. Lookup por entidade (debug, audit)
create index event_log_entity_idx
  on public.event_log (entity_kind, entity_id, created_at desc);

-- 5. Consumed_by GIN (raro mas útil pra "quais eventos worker X processou")
create index event_log_consumed_by_gin
  on public.event_log using gin (consumed_by);

-- Tabela mãe partitioned (alternativa: criar desde o início particionada)
-- Para MVP: começamos não-particionado e migramos quando volume > 5M rows.

-- Trigger de retenção: archive worker move > 90d pra cold storage (S3/Storage)
-- e DELETE da tabela quente. Detalhado em §6.9 (audit-archive-worker, mesmo padrão).

alter table public.event_log enable row level security;

-- Tenant isolation: usuário só vê eventos da sua org
create policy event_log_select_own_org on public.event_log
  for select using (organization_id = auth.organization_id());

-- INSERT: apenas service role (workers) ou via funções SECURITY DEFINER
-- ServerActions e triggers usam RPC `emit_event(...)` SECURITY DEFINER
revoke insert, update, delete on public.event_log from authenticated, anon;

-- Workers acessam via service_role key (bypass RLS) → ver §4

create or replace function public.emit_event(
  p_event_type     text,
  p_entity_kind    text,
  p_entity_id      uuid,
  p_payload        jsonb default '{}'::jsonb,
  p_metadata       jsonb default '{}'::jsonb,
  p_organization_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_event_id uuid;
begin
  v_org_id := coalesce(p_organization_id, auth.organization_id());
  if v_org_id is null then
    raise exception 'emit_event: organization_id obrigatório';
  end if;

  insert into public.event_log
    (organization_id, event_type, entity_kind, entity_id, payload, metadata)
  values
    (v_org_id, p_event_type, p_entity_kind, p_entity_id,
     coalesce(p_payload, '{}'::jsonb),
     coalesce(p_metadata, '{}'::jsonb)
       || jsonb_build_object('emitted_at', extract(epoch from now())))
  returning id into v_event_id;

  return v_event_id;
end $$;

create or replace function public.claim_events(
  p_worker text,
  p_event_types text[],
  p_limit int default 25
) returns setof public.event_log
language plpgsql
security definer
as $$
begin
  return query
  with picked as (
    select id from public.event_log
    where status = 'pending'
      and event_type = any(p_event_types)
      and not (p_worker = any(consumed_by))
      and (next_attempt_at is null or next_attempt_at <= now())
    order by created_at
    limit p_limit
    for update skip locked
  )
  update public.event_log e
     set status = 'processing',
         attempts = attempts + 1,
         updated_at = now()
    from picked
   where e.id = picked.id
  returning e.*;
end $$;

-- Trigger emite NOTIFY após INSERT em event_log de tipos high-priority
create or replace function notify_high_priority_event() returns trigger as $$
begin
  if NEW.event_type in ('message.received', 'ai.handoff_triggered') then
    perform pg_notify('event_log_high', NEW.id::text);
  end if;
  return NEW;
end $$ language plpgsql;

create trigger event_log_notify_high_priority
  after insert on public.event_log
  for each row execute function notify_high_priority_event();

create or replace function public.nack_event(
  p_event_id uuid, p_worker text, p_error text
) returns void language plpgsql security definer as $$
declare
  v_attempts smallint;
  v_max_attempts smallint := 8;
  v_backoff interval;
begin
  select attempts into v_attempts from public.event_log where id = p_event_id;

  if v_attempts >= v_max_attempts then
    update public.event_log
       set status = 'dead', last_error = p_error, updated_at = now()
     where id = p_event_id;
  else
    v_backoff := (case v_attempts
      when 1 then '30 seconds' when 2 then '1 minute' when 3 then '2 minutes'
      when 4 then '5 minutes'  when 5 then '10 minutes' when 6 then '30 minutes'
      when 7 then '1 hour'     else '2 hours' end)::interval;
    update public.event_log
       set status = 'pending', last_error = p_error,
           next_attempt_at = now() + v_backoff
                            + (random() * 0.3 * v_backoff),
           updated_at = now()
     where id = p_event_id;
  end if;
end $$;

-- Em webhook_subscriptions:
alter table webhook_subscriptions
  add column consecutive_failures int not null default 0,
  add column enabled boolean not null default true;

-- worker incrementa em falha, zera em sucesso, e quando atinge 10:
update webhook_subscriptions
   set enabled = false, consecutive_failures = 0
 where id = $1;
-- + emit webhook.subscription_disabled

select event_type,
       extract(epoch from (now() - min(created_at))) as lag_seconds
  from event_log
 where status = 'pending'
 group by event_type;

-- "tudo que aconteceu na request X"
select 'audit' as src, * from audit_log where metadata->>'request_id' = $1
union all
select 'event' as src, * from event_log where metadata->>'request_id' = $1
order by created_at;

-- Cron auxiliar: marca como pending eventos 'processing' há > 5min (worker crashou)
update event_log
   set status = 'pending', updated_at = now()
 where status = 'processing'
   and updated_at < now() - interval '5 minutes';


