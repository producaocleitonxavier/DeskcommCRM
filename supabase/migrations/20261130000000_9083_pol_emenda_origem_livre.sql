-- 9083 — Origem do PEDIDO de emenda vira CAMPO ABERTO (texto livre).
--
-- O 9082 criou solicitante_origem com CHECK de 5 categorias
-- (lideranca|entidade|prefeitura|gabinete|publico). Na prática isso travava
-- nomes reais: "Guarda Municipal" não é "entidade" (terceiro setor), é força de
-- segurança. Decisão do cliente: o assessor ESCREVE de onde veio o pedido, sem
-- caixinha. Removemos a trava; a coluna segue TEXT (os valores antigos
-- continuam válidos). Idempotente: derruba qualquer CHECK que cite a coluna.

do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'pol_emendas'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%solicitante_origem%'
  loop
    execute format('alter table pol_emendas drop constraint %I', r.conname);
  end loop;
end $$;
