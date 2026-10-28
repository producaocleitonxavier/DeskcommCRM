-- manifest: 9065 — "Voz do Mandato" (Fase 2, DORMENTE por padrão). pol_voz_config: singleton por org com o clone de voz do PRÓPRIO político (ElevenLabs). ativo nasce FALSE; nada gera áudio enquanto ativo=false ou sem voice_id. Guarda o provedor, o voice_id do clone, a URL da amostra e o CONSENTIMENTO (quem assinou, quando) — exigência TSE 23.755/2026 (só a voz do próprio político, com consentimento arquivado). Aditivo, faixa 9000+ do fork.

create table if not exists public.pol_voz_config (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  -- Interruptor-mestre. NASCE FALSE: nada gera voz até o gabinete clonar e ligar.
  ativo boolean not null default false,
  -- Provedor de TTS/clonagem. Começa com elevenlabs; coluna permite trocar depois.
  provider text not null default 'elevenlabs',
  -- ID do clone de voz no provedor (ElevenLabs voice_id). null até clonar.
  voice_id text,
  -- URL da amostra de voz enviada (Supabase Storage), para auditoria/reuso.
  amostra_url text,
  -- CONSENTIMENTO (TSE): quem autorizou a clonagem da própria voz e quando.
  consentimento_assinado boolean not null default false,
  consentimento_por text,                 -- nome/identificação de quem assinou
  consentimento_em timestamptz,
  consentimento_doc_url text,             -- termo assinado arquivado (opcional)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pol_voz_config enable row level security;
drop policy if exists tenant_isolation_pol_voz_config_all on public.pol_voz_config;
create policy tenant_isolation_pol_voz_config_all on public.pol_voz_config
  using (organization_id in (select public.fn_user_org_ids()));

revoke all on public.pol_voz_config from anon;
grant select, insert, update, delete on public.pol_voz_config to authenticated;

notify pgrst, 'reload schema';
