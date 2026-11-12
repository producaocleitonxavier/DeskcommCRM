"use server";

/**
 * Enriquecimento do mandato — a ação que dispara a BUSCA (fase 1). Lê os dados do
 * mandato já salvos (identidade + tipo + cidade/UF), pesquisa na web pela fonte
 * oficial certa e devolve os achados nos 2 baldes. NÃO grava nada — a tela
 * aprova item a item (fases 2 e 3). Gate de gestor.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { supportWriteError } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { BUCKET_DE_CONHECIMENTO } from "@/lib/ai/rag/ingest/documento";
import { CHAVE_GABINETE } from "@/lib/politico/aviso-de-resolucao";
import { CHAVE_MANDATO, CHAVE_MANDATO_GERADO } from "@/lib/politico/setup-do-mandato";
import { pesquisarMandato, achadoSchema, type ResultadoPesquisa } from "@/lib/politico/pesquisar-mandato";
import type { DadosDoMandato } from "@/lib/politico/gerar-conhecimento";
import { acharAgenteDoMandato } from "@/lib/politico/provisionar-agente";
import { anexarMaterialAoAgente } from "@/lib/politico/anexar-material-ao-agente";

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

export type ResultadoAplicar = { ok: true; acrescentados: number } | { ok: false; erro: string };

/**
 * APLICA o enriquecimento aprovado pelo humano: o balde 🟢 "cidadao" vira uma
 * FONTE DE CONHECIMENTO anexada ao agente do mandato (entra no RAG); o balde 🔵
 * "equipe" fica em `settings.gabinete.inteligencia_equipe` (interno, NUNCA no
 * RAG). Só grava o que foi APROVADO. Gate de gestor.
 */
export async function aplicarEnriquecimento(aprovadosRaw: unknown): Promise<ResultadoAplicar> {
  const parsed = z.array(achadoSchema).max(20).safeParse(aprovadosRaw);
  if (!parsed.success) return { ok: false, erro: "Dados inválidos." };
  const aprovados = parsed.data;
  if (aprovados.length === 0) return { ok: false, erro: "Selecione ao menos um item." };

  const user = await loadAuthUser();
  if (!user) return { ok: false, erro: "Sessão expirada." };
  if (supportWriteError(user.support)) return { ok: false, erro: "Sem permissão." };
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Organização não encontrada." };
  if (ROLE_RANK[org.role] < ROLE_RANK.manager) return { ok: false, erro: "Só um gestor pode acrescentar." };
  if (await mfaEmDivida()) return { ok: false, erro: "Verificação de 2 fatores pendente." };

  const admin = createAdminClient();
  const [cfgRes, orgRes] = await Promise.all([
    admin.from("pol_gabinete_config").select("nome_parlamentar").eq("organization_id", org.orgId).maybeSingle(),
    admin.from("organizations").select("settings").eq("id", org.orgId).maybeSingle(),
  ]);
  const nome = ((cfgRes.data as { nome_parlamentar?: string | null } | null)?.nome_parlamentar ?? "mandato").trim() || "mandato";
  const settings = (orgRes.data?.settings ?? {}) as Record<string, unknown>;
  const gabinete = (settings[CHAVE_GABINETE] ?? {}) as Record<string, unknown>;
  const gerado = (gabinete[CHAVE_MANDATO_GERADO] ?? {}) as { agente_id?: string | null };

  const cidadao = aprovados.filter((a) => a.balde === "cidadao");
  const equipe = aprovados.filter((a) => a.balde === "equipe");

  // 1) 🟢 cidadão → nova fonte de conhecimento + anexa ao agente do mandato (RAG).
  if (cidadao.length > 0) {
    // O material de enriquecimento é UM por organização e ACUMULA: o nome é único
    // por org (`ai_knowledge_sources_nome_unico_por_org`), então uma 2ª aprovação
    // não pode inserir outra linha — ela acrescenta ao MESMO documento e pede o
    // re-preparo. (Bug de 11/nov: o 2º insert era recusado, o erro era engolido e
    // a tela dizia "acrescentado" sem gravar nada.)
    const secoes = (itens: typeof cidadao) =>
      itens.map((a) => `## ${a.titulo}\n${a.resumo}\nFonte: ${a.fonte}`).join("\n\n");
    try {
      const { data: existente } = await admin
        .from("ai_knowledge_sources")
        .select("id, source_metadata")
        .eq("organization_id", org.orgId)
        .eq("source_metadata->>origem", "enriquecimento")
        .neq("status", "archived")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const atual = existente as { id: string; source_metadata: { blob_path?: string } | null } | null;

      let ksId: string;
      if (atual?.id && atual.source_metadata?.blob_path) {
        const caminho = atual.source_metadata.blob_path;
        const { data: blob, error: downErr } = await admin.storage.from(BUCKET_DE_CONHECIMENTO).download(caminho);
        if (downErr || !blob) throw new Error(`download: ${downErr?.message ?? "vazio"}`);
        const anterior = await blob.text();
        // Não repete item que já está lá (mesmo título).
        const novos = cidadao.filter((a) => !anterior.includes(`## ${a.titulo}\n`));
        if (novos.length > 0) {
          const md = `${anterior.trimEnd()}\n\n${secoes(novos)}\n`;
          const { error: upErr } = await admin.storage
            .from(BUCKET_DE_CONHECIMENTO)
            .upload(caminho, Buffer.from(md, "utf8"), { contentType: "text/markdown", upsert: true });
          if (upErr) throw new Error(`upload: ${upErr.message}`);
        }
        ksId = atual.id;
      } else {
        const md = `# Enriquecimento do mandato (pesquisa pública)\n\n${secoes(cidadao)}\n`;
        const blobPath = `${org.orgId}/${randomUUID()}.md`;
        const { error: upErr } = await admin.storage
          .from(BUCKET_DE_CONHECIMENTO)
          .upload(blobPath, Buffer.from(md, "utf8"), { contentType: "text/markdown", upsert: false });
        if (upErr) throw new Error(`upload: ${upErr.message}`);
        const { data: ks, error: insErr } = await admin
          .from("ai_knowledge_sources")
          .insert({
            organization_id: org.orgId,
            agent_id: null,
            source_type: "documento",
            name: `Enriquecimento — ${nome}`.slice(0, 120),
            status: "ready",
            is_active: true,
            source_metadata: { blob_path: blobPath, ext: "md", origem: "enriquecimento" },
            ingested_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (insErr || !ks) throw new Error(`insert: ${insErr?.message ?? "sem linha"}`);
        ksId = (ks as { id: string }).id;
      }
      {
        {
          await admin.rpc("emit_event" as never, {
            p_event_type: "knowledge_source.updated",
            p_entity_kind: "ai_knowledge_source",
            p_entity_id: ksId,
            p_payload: { knowledge_source_id: ksId, agent_id: null, source_type: "documento" },
            p_organization_id: org.orgId,
          } as never);
          // Anexa ao agente do mandato — versão mais recente (mesmo rascunho).
          const agenteId = await acharAgenteDoMandato(admin, org.orgId, gerado.agente_id);
          if (!agenteId) {
            logger.warn("aplicar-enriquecimento: nenhum agente do mandato para anexar o material", {
              organization_id: org.orgId,
              knowledge_source_id: ksId,
            });
          }
          if (agenteId) {
            // Versão publicada é imutável: o material entra por uma versão NOVA
            // publicada (ou no rascunho, se o agente ainda não foi publicado). E o
            // resultado é CONFERIDO — antes o erro do banco era engolido e a tela
            // dizia "acrescentado" com o agente sem consultar nada (12/nov).
            const anexo = await anexarMaterialAoAgente(admin, { orgId: org.orgId, agenteId, materialId: ksId, userId: user.id });
            if (!anexo.ok) throw new Error(`anexar: ${anexo.motivo}`);
            logger.info("aplicar-enriquecimento: material anexado ao agente", { organization_id: org.orgId, knowledge_source_id: ksId, como: anexo.como });
          }
        }
      }
    } catch (err) {
      // Falhou de verdade → DIZ que falhou. Nunca "acrescentado" sem ter gravado.
      logger.warn("aplicar-enriquecimento: falha no RAG", { organization_id: org.orgId, causa: err instanceof Error ? err.message : String(err) });
      return { ok: false, erro: "Não consegui gravar no conhecimento do agente. Nada foi acrescentado — tente de novo." };
    }
  }

  // 2) 🔵 equipe → inteligência INTERNA (settings.gabinete), NUNCA no RAG do cidadão.
  if (equipe.length > 0) {
    const atual = Array.isArray(gabinete.inteligencia_equipe) ? (gabinete.inteligencia_equipe as unknown[]) : [];
    const novo = {
      ...settings,
      [CHAVE_GABINETE]: {
        ...gabinete,
        inteligencia_equipe: [
          ...atual,
          ...equipe.map((e) => ({ titulo: e.titulo, resumo: e.resumo, fonte: e.fonte, em: new Date().toISOString() })),
        ],
      },
    };
    const { error: erroEquipe } = await admin.from("organizations").update({ settings: novo }).eq("id", org.orgId);
    if (erroEquipe) {
      logger.warn("aplicar-enriquecimento: falha ao gravar a inteligência da equipe", { organization_id: org.orgId, causa: erroEquipe.message });
      return { ok: false, erro: "Não consegui gravar a inteligência da equipe. Tente de novo." };
    }
  }

  return { ok: true, acrescentados: aprovados.length };
}
