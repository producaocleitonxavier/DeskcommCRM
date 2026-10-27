-- manifest: 9064 — link_material em pol_ig_captacao_config: campo único para o link do material (ebook/PDF/vídeo). O cliente cola o endereço UMA vez no Avançado da Personalização; o sistema injeta esse link onde houver {{link}} (e no legado [COLE O LINK]) nas mensagens de entrega e de retorno. Trocou o material do mês? Troca só aqui. Regra de ouro ("à prova de criança"). Coluna opcional (default no código). Aditivo, faixa 9000+ do fork.

alter table public.pol_ig_captacao_config
  add column if not exists link_material text;

notify pgrst, 'reload schema';
