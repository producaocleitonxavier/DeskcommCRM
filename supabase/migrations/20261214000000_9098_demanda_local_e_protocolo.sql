-- manifest: 9098 — demanda ganha o LOCAL da ocorrência (logradouro, número, referência, bairro, CEP) e o Nº DO PROTOCOLO já aberto no órgão: são os dois dados que o ofício de gabinete cita e que a IA deixava como lacuna por não existirem em campo nenhum. Texto livre, opcionais, idempotente.

alter table public.demandas add column if not exists pol_local_ocorrencia text;
alter table public.demandas add column if not exists pol_protocolo_orgao text;

comment on column public.demandas.pol_local_ocorrencia is 'Local da ocorrência como vai no ofício: logradouro, número, referência, bairro, CEP.';
comment on column public.demandas.pol_protocolo_orgao is 'Número do protocolo já aberto no órgão (ex.: prefeitura), quando existe.';

notify pgrst, 'reload schema';
