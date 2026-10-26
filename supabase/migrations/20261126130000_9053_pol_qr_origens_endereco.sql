-- manifest: 9053 — Endereço e bairro do ponto de captação (pol_qr_origens). Saber ONDE cada QR está (praça/escola/evento) dá inteligência territorial: de qual região vem cada cadastro, e abre caminho pra inferir a zona eleitoral do ponto. Aditivo, faixa 9000+ do fork.

alter table public.pol_qr_origens add column if not exists endereco text;
alter table public.pol_qr_origens add column if not exists bairro text;

notify pgrst, 'reload schema';
