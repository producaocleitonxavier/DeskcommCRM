-- manifest: 9040 — Webhook do Instagram: adiciona verify_token REAL a ig_webhook_tokens (o handler GET já valida hub.verify_token, mas a coluna não existia → verificação do Meta sempre falhava). Gera um token por linha, backfill dos existentes, e a RPC fn_ig_webhook_token_por_path passa a retornar verify_token + ativo (o handler usa). Segurança: o path_token (UUID) continua sendo o segredo principal; o verify_token é a validação secundária exigida pelo Meta. Aditivo, faixa 9000+. APLICADA DIRETO via pg em 2026-10-21.

alter table public.ig_webhook_tokens add column if not exists verify_token text;
update public.ig_webhook_tokens set verify_token = replace(gen_random_uuid()::text, '-', '') where verify_token is null;
alter table public.ig_webhook_tokens alter column verify_token set default replace(gen_random_uuid()::text, '-', '');
alter table public.ig_webhook_tokens alter column verify_token set not null;

-- RPC passa a devolver verify_token + ativo (o handler compara hub.verify_token
-- e checa ativo). Mantém o filtro ativo=true: só tokens ativos resolvem (igual
-- antes), preservando a segurança do GET e do POST.
drop function if exists public.fn_ig_webhook_token_por_path(text);
create or replace function public.fn_ig_webhook_token_por_path(p_path_token text)
returns table(organization_id uuid, channel_session_id uuid, verify_token text, ativo boolean)
language sql stable security definer as $$
  select organization_id, channel_session_id, verify_token, ativo
    from public.ig_webhook_tokens
   where path_token = p_path_token
     and ativo = true
   limit 1;
$$;

notify pgrst, 'reload schema';
