-- manifest: 9003 — assessor responsavel por TEXTO LIVRE na demanda (Gabinete): coluna pol_assessor_nome em demandas, para quando o assessor NAO e usuario do sistema (o par dono_user_id/dono_kind continua sendo a verdade para membros). Aditivo, faixa 9000+ reservada para migrations proprietarias do fork (ver docs/politico-fork-strategy.md).

alter table public.demandas
  add column if not exists pol_assessor_nome text;

comment on column public.demandas.pol_assessor_nome is
  'Nome do assessor responsavel quando NAO e usuario do sistema (texto livre). Para membro, dono_user_id/dono_kind continuam a verdade; esta coluna guarda o rotulo exibido.';

notify pgrst, 'reload schema';
