-- manifest: 9081 — Inteligência de coorte: CONVERSÃO por origem. Responde "onde
-- investir" — quais origens viram apoiador+ (apoiador/militante/voto_certo). Ex.:
-- "Palestras convertem 28%, Abaixo-assinado 6%" → o gabinete sabe onde vale o
-- próximo evento/material. É o empurrão que o cliente usa SEM vasculhar o funil.
-- security_invoker = respeita a RLS de contacts/pol_leads (cada um vê só a sua org).
-- Aditivo, faixa 9000+ do fork.

create or replace view public.pol_vw_origem_conversao
  with (security_invoker = true)
  as
  select
    c.organization_id,
    c.source,
    count(*)::bigint as total,
    count(*) filter (
      where l.support_level in ('apoiador', 'militante', 'voto_certo')
    )::bigint as convertidos
  from public.contacts c
  join public.pol_leads l
    on l.contact_id = c.id and l.organization_id = c.organization_id
  where c.source is not null and length(trim(c.source)) > 0
  group by c.organization_id, c.source;

grant select on public.pol_vw_origem_conversao to authenticated;

notify pgrst, 'reload schema';
