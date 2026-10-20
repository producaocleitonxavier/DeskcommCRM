-- manifest: 9028 — Modulo Inteligencia: intel_bairro_regional (bairro -> regional administrativa, por municipio). Resolve a ALUCINACAO da IA (ela inventava "Regional Barreiro" agrupando bairros pelo nome e errava). Mapa derivado por GEOGRAFIA (ponto-dentro-do-poligono): poligonos das regionais do OSM (admin_level=9, WGS84) x lat/long de intel_locais -> regional de cada local -> regional do bairro (maioria). Fonte autoritativa, sem casar nomes. Tabela de REFERENCIA PUBLICA GLOBAL (sem organization_id), RLS select using(true) p/ authenticated. SEED (BH 41238 + Contagem 43710) aplicado por script (import_regional.js), nao no migration. Aditivo, faixa 9000+. APLICADA DIRETO via pg em 2026-10-20.

create table if not exists public.intel_bairro_regional (
  cd_municipio int  not null,
  bairro       text not null,
  regional     text not null,
  primary key (cd_municipio, bairro)
);
alter table public.intel_bairro_regional enable row level security;
drop policy if exists intel_bairro_regional_read on public.intel_bairro_regional;
create policy intel_bairro_regional_read on public.intel_bairro_regional for select to authenticated using (true);
grant select on public.intel_bairro_regional to authenticated;
revoke all on public.intel_bairro_regional from anon;

notify pgrst, 'reload schema';
