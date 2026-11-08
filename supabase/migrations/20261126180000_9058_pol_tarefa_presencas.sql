-- manifest: 9058 — Presença de equipe em tarefa de campo (Incremento 3). VÁRIOS assessores podem marcar "eu vou" na mesma visita/obra/evento — o que hoje não existe (visita tem UM responsável só; obra/evento, nenhum). Fecha o laço de accountability: o gabinete vê quem vai. Referência polimórfica (kind+id) p/ cobrir os 3 tipos sem FK rígida. Aditivo, faixa 9000+ do fork.

create table if not exists public.pol_tarefa_presencas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- O tipo da tarefa: visita (demandas pol_tipo=visita_tecnica), obra (pol_obras),
  -- evento (pol_events). id polimórfico (sem FK, pois aponta p/ 3 tabelas).
  tarefa_kind text not null check (tarefa_kind in ('visita', 'obra', 'evento')),
  tarefa_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Nome desnormalizado p/ listar "quem vai" sem join a auth.users.
  nome text,
  marcado_em timestamptz not null default now(),
  -- Uma pessoa marca UMA vez por tarefa (idempotência do "eu vou").
  unique (organization_id, tarefa_kind, tarefa_id, user_id)
);

create index if not exists idx_pol_tarefa_presencas_tarefa
  on public.pol_tarefa_presencas(organization_id, tarefa_kind, tarefa_id);
create index if not exists idx_pol_tarefa_presencas_user
  on public.pol_tarefa_presencas(organization_id, user_id);

alter table public.pol_tarefa_presencas enable row level security;
drop policy if exists tenant_isolation_pol_tarefa_presencas_all on public.pol_tarefa_presencas;
create policy tenant_isolation_pol_tarefa_presencas_all on public.pol_tarefa_presencas
  using (organization_id in (select public.fn_user_org_ids()));

revoke all on public.pol_tarefa_presencas from anon;
grant select, insert, update, delete on public.pol_tarefa_presencas to authenticated;

notify pgrst, 'reload schema';
