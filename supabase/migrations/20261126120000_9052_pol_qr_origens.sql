-- manifest: 9052 — Captação por QR (pol_qr_origens + pol_qr_cadastros). Cada origem é um QR/link wa.me por lugar (praça, escola, bio do IG, evento) que abre o WhatsApp com a mensagem pronta "me cadastrei e quero os materiais"; o código [ref:CODE] no texto rastreia de onde a pessoa veio. O inbound receptivo cria o lead, entrega o ebook e gradua — ban ~zero, janela 24h. Aditivo, faixa 9000+ do fork.

-- ─── pol_qr_origens: a configuração de cada QR/link por origem ───────────────
create table if not exists public.pol_qr_origens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Nome que o gabinete reconhece (ex.: "Praça 7 de Setembro", "Bio do Instagram").
  nome text not null,
  -- O código do rastreio, embutido no texto como [ref:CODE]. Maiúsculo, estável.
  codigo text not null,
  -- O ebook entregue na hora do cadastro (nullable = só cadastra, sem material).
  material_id uuid references public.pol_materiais(id) on delete set null,
  -- O número (sessão WhatsApp) para onde o wa.me aponta — o número do candidato.
  channel_session_id uuid references public.channel_sessions(id) on delete set null,
  -- A mensagem pronta do wa.me (sem o [ref:]; o código é anexado ao montar o link).
  mensagem text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  -- Um código é único por organização: é a chave que o handler casa no inbound.
  unique (organization_id, codigo)
);

create index if not exists idx_pol_qr_origens_org on public.pol_qr_origens(organization_id);
create index if not exists idx_pol_qr_origens_ativo on public.pol_qr_origens(organization_id, ativo);

alter table public.pol_qr_origens enable row level security;
drop policy if exists tenant_isolation_pol_qr_origens_all on public.pol_qr_origens;
create policy tenant_isolation_pol_qr_origens_all on public.pol_qr_origens
  using (organization_id in (select public.fn_user_org_ids()));

revoke all on public.pol_qr_origens from anon;
grant select, insert, update, delete on public.pol_qr_origens to authenticated;

-- ─── pol_qr_cadastros: um registro por pessoa × origem (idempotência + contagem) ─
create table if not exists public.pol_qr_cadastros (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  origem_id uuid not null references public.pol_qr_origens(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  -- Quando o ebook saiu (null = cadastrou mas o material ainda não foi entregue).
  material_entregue_at timestamptz,
  created_at timestamptz not null default now(),
  -- A mesma pessoa, no mesmo QR, cadastra UMA vez: trava a re-entrega do ebook.
  unique (origem_id, contact_id)
);

create index if not exists idx_pol_qr_cadastros_org on public.pol_qr_cadastros(organization_id);
create index if not exists idx_pol_qr_cadastros_origem on public.pol_qr_cadastros(origem_id);

alter table public.pol_qr_cadastros enable row level security;
drop policy if exists tenant_isolation_pol_qr_cadastros_all on public.pol_qr_cadastros;
create policy tenant_isolation_pol_qr_cadastros_all on public.pol_qr_cadastros
  using (organization_id in (select public.fn_user_org_ids()));

revoke all on public.pol_qr_cadastros from anon;
grant select, insert, update, delete on public.pol_qr_cadastros to authenticated;

notify pgrst, 'reload schema';
