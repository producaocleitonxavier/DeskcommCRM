-- 9073 — Tema principal da pesquisa.
-- A Pesquisa Relâmpago passa a ter um TEMA (saude, seguranca, educacao, ...)
-- definido na criação. Esse tema alimenta as sugestões de perguntas no
-- construtor (as sugestões já abrem no tema da pesquisa) e dá leitura ao
-- resultado ("pesquisa de Segurança no bairro X"). Cada pergunta ainda pode ter
-- o seu próprio tema; o da pesquisa é o guarda-chuva.

alter table pol_surveys add column if not exists theme text;
comment on column pol_surveys.theme is 'Tema principal da pesquisa (saude, seguranca, educacao, ...) — alimenta as sugestões de perguntas e a leitura do resultado.';
