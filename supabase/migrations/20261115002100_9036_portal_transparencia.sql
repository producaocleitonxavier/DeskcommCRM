-- manifest: 9036 — Portal da Transparência (vitrine pública do mandato). pol_emendas ganha `publica` (opt-in: só emendas marcadas aparecem no portal) e pol_gabinete_config ganha `portal_ativo` (liga/desliga o portal público inteiro). Obras já têm `visibilidade` (publica/restrita, 9030) — o portal usa visibilidade='publica'. Aditivo, faixa 9000+. APLICADA DIRETO via pg em 2026-10-20.

alter table public.pol_emendas add column if not exists publica boolean not null default false;
comment on column public.pol_emendas.publica is 'Emenda aparece no Portal da Transparência público do mandato (opt-in).';

alter table public.pol_gabinete_config add column if not exists portal_ativo boolean not null default false;
comment on column public.pol_gabinete_config.portal_ativo is 'Portal da Transparência público do mandato ligado.';

notify pgrst, 'reload schema';
