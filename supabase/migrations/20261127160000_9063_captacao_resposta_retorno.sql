-- manifest: 9063 — texto_resposta_comentario_retorno em pol_ig_captacao_config: a resposta PÚBLICA ao comentário de quem JÁ está no funil (retornante) passa a ser diferente da 1ª vez ("Opa, de novo por aqui!" em vez de "Olá, obrigado..."). Resolve a dor do DG Digital de mandar sempre a mesma mensagem. Coluna opcional (default no código). Aditivo, faixa 9000+ do fork.

alter table public.pol_ig_captacao_config
  add column if not exists texto_resposta_comentario_retorno text;

notify pgrst, 'reload schema';
