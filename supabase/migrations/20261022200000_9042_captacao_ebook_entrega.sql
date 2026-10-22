-- manifest: 9042 — campo texto_dm_entrega em pol_ig_captacao_config: a DM que entrega a isca (e-book grátis, com o link inline) depois que o lead da captacao do Instagram confirma os dados. Aditivo, faixa 9000+ do fork.

alter table public.pol_ig_captacao_config
  add column if not exists texto_dm_entrega text;

notify pgrst, 'reload schema';
