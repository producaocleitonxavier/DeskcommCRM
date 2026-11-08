-- manifest: 9057 — Perfilamento progressivo do QR. Token OPACO por contato para o formulário público de perfil (cidade/bairro/aniversário). O link /perfil/<token> identifica o contato direto (dispensa pedir WhatsApp de novo). Opaco e não-enumerável (randomUUID hex), ao contrário do codigo_indicacao de 6 chars (que é p/ wa.me, não p/ link web). Aditivo, nullable, único quando preenchido. Faixa 9000+ do fork.

alter table public.contacts
  add column if not exists perfil_token text;

-- Único só quando preenchido (índice parcial) — o token resolve 1 contato.
create unique index if not exists contacts_perfil_token_key
  on public.contacts(perfil_token)
  where perfil_token is not null;

notify pgrst, 'reload schema';
