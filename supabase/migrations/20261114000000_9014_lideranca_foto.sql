-- manifest: 9014 — foto da lideranca (Gabinete/War Room): coluna foto_path em pol_liderancas + bucket PRIVADO gabinete-liderancas (5MB, service_role; download por URL assinada). Avatar na lista e foto no detalhe, deixando o painel mais apresentavel. Aditivo, faixa 9000+ reservada para migrations proprietarias do fork (ver docs/politico-fork-strategy.md).

insert into storage.buckets (id, name, public, file_size_limit)
values ('gabinete-liderancas', 'gabinete-liderancas', false, 5242880)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

alter table public.pol_liderancas
  add column if not exists foto_path text;

notify pgrst, 'reload schema';
