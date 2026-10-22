-- manifest: 9043 — campo texto_dm_retorno em pol_ig_captacao_config: a DM calorosa (CTA de apoio + link do material) enviada a quem JA esta no funil e interage de novo, em vez de reenviar a pesquisa ou criar card novo. Mantem o fã próximo sem duplicar no Kanban. Aditivo, faixa 9000+ do fork.

alter table public.pol_ig_captacao_config
  add column if not exists texto_dm_retorno text;

notify pgrst, 'reload schema';
