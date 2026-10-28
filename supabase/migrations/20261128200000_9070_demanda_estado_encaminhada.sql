-- 9070 — Ciclo da demanda: adiciona o estado 'encaminhada'.
--
-- "Aguardando cidadão" (aguardando_cliente) é herança do CRM comercial — no
-- gabinete você espera o ÓRGÃO, não o cidadão. O marco real que faltava é
-- 'encaminhada' (o ofício saiu pro órgão). O fluxo passa a ser:
--   Nova → Em atendimento → Encaminhada → Atendida (resolvida) / Encerrada.
--
-- aguardando_cliente FICA no CHECK (não quebra demandas antigas nesse estado),
-- mas sai do fluxo da tela. Recria o CHECK (inline vira demandas_estado_check).

alter table demandas drop constraint if exists demandas_estado_check;
alter table demandas add constraint demandas_estado_check
  check (estado in ('aberta', 'em_atendimento', 'encaminhada', 'aguardando_cliente', 'resolvida', 'encerrada'));
