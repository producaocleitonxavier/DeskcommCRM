-- manifest: adiciona fn_ig_incrementar_stats_flow (RPC atômica de contagem do motor ManyChat) e colunas faltantes em ig_comment_events (field, raw_payload, parent_comment_id)

-- ══════════════════════════════════════════════════════════════════
-- 1. Colunas faltantes em ig_comment_events
--    O baseline já as inclui; esta migration garante que bancos
--    atualizados via cadeia de migrations também as recebam.
-- ══════════════════════════════════════════════════════════════════

alter table public.ig_comment_events
  add column if not exists parent_comment_id text,
  add column if not exists field text,
  add column if not exists raw_payload jsonb not null default '{}';

-- ══════════════════════════════════════════════════════════════════
-- 2. fn_ig_incrementar_stats_flow — incremento atômico de stats
--
--    Chamada pelo motor de automação (motor.handler.ts) toda vez que
--    um flow é acionado. Incrementa `stats->>'total_acionamentos'`
--    atomicamente via jsonb_set, sem race condition.
--
--    Security definer para que o worker (service role) possa chamar
--    sem depender de RLS. Sem seletor de linha além do p_flow_id —
--    não é vetor de adulteração.
-- ══════════════════════════════════════════════════════════════════

create or replace function public.fn_ig_incrementar_stats_flow(
  p_flow_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ig_automation_flows
  set stats = jsonb_set(
    coalesce(stats, '{"total_acionamentos":0}'::jsonb),
    '{total_acionamentos}',
    to_jsonb(coalesce((stats->>'total_acionamentos')::int, 0) + 1)
  )
  where id = p_flow_id;
end;
$$;

-- Revogar acesso público (doutrina: function nova nasce exposta)
revoke execute on function public.fn_ig_incrementar_stats_flow(uuid) from public, anon;
grant  execute on function public.fn_ig_incrementar_stats_flow(uuid) to service_role;

comment on function public.fn_ig_incrementar_stats_flow is
  'Incrementa atomicamente stats.total_acionamentos de um ig_automation_flows. Chamada pelo motor de automação Instagram.';
