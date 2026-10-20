-- manifest: 9031 — Gabinete: vincula a conta ao CANDIDATO do parlamentar no TSE (eleição + sq) em pol_gabinete_config. Desbloqueia o cruzamento "você investiu onde te elegeu?": com o sq, toda obra/emenda/demanda num bairro mostra os VOTOS reais que o parlamentar fez ali (via intel_cand_drill). Base do indicador ROI de Emenda. Aditivo, faixa 9000+. APLICADA DIRETO via pg em 2026-10-20.

alter table public.pol_gabinete_config add column if not exists tse_election_id bigint;
alter table public.pol_gabinete_config add column if not exists tse_sq_candidato bigint;
alter table public.pol_gabinete_config add column if not exists tse_candidato_nome text;

notify pgrst, 'reload schema';
