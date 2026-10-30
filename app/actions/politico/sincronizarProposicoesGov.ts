"use server";

/**
 * Sincroniza as PROPOSIÇÕES (projetos, PECs, requerimentos, indicações…) de
 * autoria do parlamentar a partir da API ABERTA da Câmara dos Deputados, com a
 * situação/tramitação atual, para `pol_projetos_lei`. Sem duplicar: casa por
 * (org, numero) — atualiza status/comissão se já existe, insere se não.
 * Só DEPUTADO FEDERAL; o nome é casado EXATO para nunca puxar homônimo. Vereador
 * municipal volta 0 (câmaras municipais não têm API) — e isso é ok. Gate ADMIN.
 */
import { revalidatePath } from "next/cache";

import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { supportWriteError } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { acharDeputado, buscarProposicoes, type ProposicaoGov } from "@/lib/politico/gov-camara";
import { acharSenador, buscarMateriasSenado } from "@/lib/politico/gov-senado";

export type ResultadoSyncProp =
  | { ok: true; total: number; inseridas: number; atualizadas: number; semNome?: boolean; naoEhDeputado?: boolean; fonte?: "camara" | "senado" }
  | { ok: false; error: string };

export async function sincronizarProposicoesGov(): Promise<ResultadoSyncProp> {
  const user = await loadAuthUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (supportWriteError(user.support)) return { ok: false, error: "forbidden_role" };
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, error: "forbidden_tenant" };
  if (ROLE_RANK[org.role] < ROLE_RANK.admin) return { ok: false, error: "forbidden_role" };
  if (await mfaEmDivida()) return { ok: false, error: "mfa_required" };

  const admin = createAdminClient();
  const { data: cfg } = await admin
    .from("pol_gabinete_config")
    .select("nome_parlamentar, tse_candidato_nome")
    .eq("organization_id", org.orgId)
    .maybeSingle();
  const c = cfg as { nome_parlamentar: string | null; tse_candidato_nome: string | null } | null;
  const nome = (c?.nome_parlamentar ?? c?.tse_candidato_nome ?? "").trim();
  if (!nome) return { ok: true, total: 0, inseridas: 0, atualizadas: 0, semNome: true };

  const agora = new Date().getFullYear();
  const anos = [agora, agora - 1, agora - 2];
  let proposicoes: ProposicaoGov[];
  let fonte: "camara" | "senado";
  try {
    // 1º tenta Câmara (deputado federal); se não for, tenta Senado (senador).
    const deputado = await acharDeputado(nome);
    if (deputado) {
      fonte = "camara";
      proposicoes = await buscarProposicoes(deputado.id, anos, 30);
    } else {
      const senador = await acharSenador(nome);
      if (!senador) return { ok: true, total: 0, inseridas: 0, atualizadas: 0, naoEhDeputado: true };
      fonte = "senado";
      proposicoes = await buscarMateriasSenado(senador.codigo, anos, 30);
    }
  } catch {
    return { ok: false, error: "falha_na_api" };
  }

  let inseridas = 0;
  let atualizadas = 0;
  for (const p of proposicoes) {
    if (!p.numeroLabel) continue;
    const titulo = (p.ementa ?? "").slice(0, 300) || p.numeroLabel;
    const origemLabel = fonte === "senado" ? "Importado do Senado Federal." : "Importado da Câmara dos Deputados.";
    const descricao = [origemLabel, p.situacao && `Situação: ${p.situacao}.`].filter(Boolean).join(" ");

    const { data: existente } = await admin
      .from("pol_projetos_lei")
      .select("id")
      .eq("organization_id", org.orgId)
      .eq("numero", p.numeroLabel)
      .limit(1);
    const achou = (existente ?? [])[0] as { id: string } | undefined;

    if (achou) {
      await admin
        .from("pol_projetos_lei")
        .update({
          status: p.status,
          comissao_atual: p.orgao,
          descricao,
          url_oficial: p.url,
          data_ultima_movimentacao: new Date().toISOString().slice(0, 10),
          updated_at: new Date().toISOString(),
        })
        .eq("id", achou.id)
        .eq("organization_id", org.orgId);
      atualizadas++;
    } else {
      await admin.from("pol_projetos_lei").insert({
        organization_id: org.orgId,
        numero: p.numeroLabel,
        titulo,
        tipo: p.tipo,
        esfera: "federal",
        status: p.status,
        ementa: p.ementa,
        descricao,
        url_oficial: p.url,
        comissao_atual: p.orgao,
        autor_mandatario: true,
        data_ultima_movimentacao: new Date().toISOString().slice(0, 10),
      });
      inseridas++;
    }
  }

  revalidatePath("/app/politico/projetos-lei");
  revalidatePath("/app/politico/prestacao-contas");
  return { ok: true, total: proposicoes.length, inseridas, atualizadas, fonte };
}
