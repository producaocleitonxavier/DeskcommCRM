"use server";

/**
 * Enriquecimento do mandato — a ação que dispara a BUSCA (fase 1). Lê os dados do
 * mandato já salvos (identidade + tipo + cidade/UF), pesquisa na web pela fonte
 * oficial certa e devolve os achados nos 2 baldes. NÃO grava nada — a tela
 * aprova item a item (fases 2 e 3). Gate de gestor.
 */
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { supportWriteError } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { CHAVE_GABINETE } from "@/lib/politico/aviso-de-resolucao";
import { CHAVE_MANDATO } from "@/lib/politico/setup-do-mandato";
import { pesquisarMandato, type ResultadoPesquisa } from "@/lib/politico/pesquisar-mandato";
import type { DadosDoMandato } from "@/lib/politico/gerar-conhecimento";

export async function pesquisarMandatoAtual(): Promise<ResultadoPesquisa> {
  const user = await loadAuthUser();
  if (!user) return { ok: false, erro: "Sessão expirada." };
  if (supportWriteError(user.support)) return { ok: false, erro: "Sem permissão." };
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Organização não encontrada." };
  if (ROLE_RANK[org.role] < ROLE_RANK.manager) return { ok: false, erro: "Só um gestor pode pesquisar." };
  if (await mfaEmDivida()) return { ok: false, erro: "Verificação de 2 fatores pendente." };

  const admin = createAdminClient();
  const [cfgRes, orgRes] = await Promise.all([
    admin.from("pol_gabinete_config").select("nome_parlamentar, cargo, cidade").eq("organization_id", org.orgId).maybeSingle(),
    admin.from("organizations").select("settings").eq("id", org.orgId).maybeSingle(),
  ]);
  const cfg = (cfgRes.data ?? {}) as { nome_parlamentar?: string | null; cargo?: string | null; cidade?: string | null };
  const settings = (orgRes.data?.settings ?? {}) as Record<string, unknown>;
  const gabinete = (settings[CHAVE_GABINETE] ?? {}) as Record<string, unknown>;
  const mandato = (gabinete[CHAVE_MANDATO] ?? {}) as Record<string, unknown>;

  const dados: DadosDoMandato = {
    nome: cfg.nome_parlamentar ?? null,
    cargo: cfg.cargo ?? null,
    cidade: cfg.cidade ?? null,
    uf: (mandato.uf as string | null) ?? null,
    tipo: (mandato.tipo as DadosDoMandato["tipo"]) ?? null,
    horario: (mandato.horario as string | null) ?? null,
    whats: (mandato.whats as string | null) ?? null,
    insta: (mandato.insta as string | null) ?? null,
    endereco: (mandato.endereco as string | null) ?? null,
    email: (mandato.email as string | null) ?? null,
    agendaContato: (mandato.agendaContato as string | null) ?? null,
    portal: (mandato.portal as string | null) ?? null,
    servicos: (mandato.servicos as DadosDoMandato["servicos"]) ?? [],
    orgaos: (mandato.orgaos as string | null) ?? null,
    bio: (mandato.bio as string | null) ?? null,
    temas: (mandato.temas as string | null) ?? null,
  };
  if (!dados.nome?.trim()) return { ok: false, erro: "Configure o mandato (nome do parlamentar) antes de pesquisar." };

  return pesquisarMandato(admin, org.orgId, dados);
}
