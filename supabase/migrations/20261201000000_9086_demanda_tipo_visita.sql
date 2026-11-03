-- 9086 — Corrige o CHECK de demandas.pol_tipo: faltava 'visita_tecnica'.
--
-- O formulário de demanda oferece "Visita técnica" como tipo, mas o CHECK de
-- pol_tipo (migration 0641) só aceitava 10 valores sem ela → o banco recusava a
-- gravação. CHECK não se altera in-place: derruba e recria com o valor a mais.
-- Idempotente: o DO block remove qualquer CHECK que cite pol_tipo (independe do
-- nome gerado), e o ADD é condicionado a não existir ainda.

do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.demandas'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%pol_tipo%'
  loop
    execute format('alter table public.demandas drop constraint %I', r.conname);
  end loop;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.demandas'::regclass and conname = 'demandas_pol_tipo_check'
  ) then
    alter table public.demandas
      add constraint demandas_pol_tipo_check check (pol_tipo in (
        'servico_publico', 'infraestrutura', 'saude', 'educacao',
        'seguranca', 'assistencia_social', 'meio_ambiente',
        'documentacao', 'emprego', 'outro', 'visita_tecnica'
      ));
  end if;
end $$;
