-- manifest: 9033 — Gabinete/Emendas: pol_emendas ganha BAIRRO (o destino tinha "município" duas vezes — campo município + dropdown território; agora município + bairro, e o bairro ativa o cruzamento de voto por bairro igual nas Obras) e RESPONSAVEL_NOME (texto livre; "Liderança que intermediou" vira "Responsável pela emenda" — a pessoa pode não ter cadastro, então campo livre + vínculo opcional a liderança). Aditivo, faixa 9000+. APLICADA DIRETO via pg em 2026-10-20.

alter table public.pol_emendas add column if not exists bairro text;
alter table public.pol_emendas add column if not exists responsavel_nome text;

notify pgrst, 'reload schema';
