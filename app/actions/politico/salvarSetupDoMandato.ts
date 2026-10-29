"use server";

/**
 * Grava o Setup do Mandato (assistente de pré-configuração "liga e está pronto").
 *
 * Duas gravações: a IDENTIDADE vai para `pol_gabinete_config` (mesma tabela do
 * timbre do ofício — fonte única, ver lib/politico/identidade-do-mandato.ts); o
 * resto (tipo de mandato, canais, portal de serviços + links, órgãos, bio) vai
 * para `organizations.settings.gabinete.mandato`, e marca
 * `settings.gabinete.setup_completo = true` (sem migration) — é o sinal que faz
 * o sistema abrir no assistente na PRIMEIRA entrada e depois ir para a home.
 *
 * Service role com `organization_id` de fonte confiável (resolveActiveOrg),
 * mesmo motivo de `definirAvisoDeResolucao`. Gate ADMIN. `settings` é jsonb
 * compartilhado: ler, mesclar e gravar preserva o que não é nosso.
 *
 * ⚠️ Esta é a GRAVAÇÃO. A GERAÇÃO automática (montar o conhecimento da IA e o
 * prompt a partir destes dados) é o próximo passo e consome exatamente o que fica
 * salvo aqui.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { supportWriteError } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { CHAVE_GABINETE } from "@/lib/politico/aviso-de-resolucao";
import { CHAVE_SETUP_COMPLETO, CHAVE_SETUP_ADIADO, CHAVE_MANDATO, CHAVE_MANDATO_GERADO } from "@/lib/politico/setup-do-mandato";
import { montarConhecimentoDoMandato, montarPromptDoMandato, type DadosDoMandato } from "@/lib/politico/gerar-conhecimento";

const servicoSchema = z.object({
  nome: z.string().trim().max(120),
  link: z.string().trim().max(500),
});

const payloadSchema = z.object({
  tipo: z.enum(["vereador", "prefeito", "dep_estadual", "dep_federal"]).nullable(),
  nome: z.string().trim().max(160),
  cargo: z.string().trim().max(80),
  cidade: z.string().trim().max(120),
  uf: z.string().trim().max(2),
  subtitulo: z.string().trim().max(160),
  whats: z.string().trim().max(40),
  horario: z.string().trim().max(120),
  insta: z.string().trim().max(80),
  endereco: z.string().trim().max(240),
  email: z.string().trim().max(160),
  agendaContato: z.string().trim().max(200),
  portal: z.string().trim().max(500),
  servicos: z.array(servicoSchema).max(40),
  orgaos: z.string().trim().max(2000),
  bio: z.string().trim().max(4000),
  temas: z.string().trim().max(500),
});

export type ResultadoSetup = { ok: true } | { ok: false; error: string };

export async function salvarSetupDoMandato(entrada: unknown): Promise<ResultadoSetup> {
  const parsed = payloadSchema.safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "validation_failed" };
  const d = parsed.data;

  const user = await loadAuthUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (supportWriteError(user.support)) return { ok: false, error: "forbidden_role" };
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, error: "forbidden_tenant" };
  if (ROLE_RANK[org.role] < ROLE_RANK.admin) return { ok: false, error: "forbidden_role" };
  if (await mfaEmDivida()) return { ok: false, error: "mfa_required" };

  const admin = createAdminClient();

  // 1) Identidade → pol_gabinete_config (fonte única).
  const { error: erroIdent } = await admin
    .from("pol_gabinete_config")
    .upsert(
      {
        organization_id: org.orgId,
        nome_parlamentar: d.nome || null,
        cargo: d.cargo || null,
        subtitulo: d.subtitulo || null,
        cidade: d.cidade || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" },
    );
  if (erroIdent) return { ok: false, error: "erro_ao_gravar_identidade" };

  // 2) Resto + marca de conclusão → settings.gabinete (merge que preserva o resto).
  const { data: atual, error: erroLeitura } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", org.orgId)
    .maybeSingle();
  if (erroLeitura) return { ok: false, error: "erro_ao_gravar" };

  const settings = (atual?.settings ?? {}) as Record<string, unknown>;
  const gabinete = (settings[CHAVE_GABINETE] ?? {}) as Record<string, unknown>;
  const mandato = {
    tipo: d.tipo,
    uf: d.uf || null,
    whats: d.whats || null,
    horario: d.horario || null,
    insta: d.insta || null,
    endereco: d.endereco || null,
    email: d.email || null,
    agendaContato: d.agendaContato || null,
    portal: d.portal || null,
    servicos: d.servicos.filter((s) => s.nome || s.link),
    orgaos: d.orgaos || null,
    bio: d.bio || null,
    temas: d.temas || null,
  };
  // A inteligência MONTA O RESTO (puro, determinístico): compõe o conhecimento
  // que a IA vai consultar + o prompt do agente, a partir do que foi preenchido.
  // Fica salvo pronto para aplicar ao agente (passo de provisionamento). NÃO
  // sobrescreve agente/RAG já existentes aqui — é só a geração do conteúdo.
  const dados: DadosDoMandato = {
    nome: d.nome || null,
    cargo: d.cargo || null,
    cidade: d.cidade || null,
    uf: d.uf || null,
    tipo: d.tipo,
    horario: d.horario || null,
    whats: d.whats || null,
    insta: d.insta || null,
    endereco: d.endereco || null,
    email: d.email || null,
    agendaContato: d.agendaContato || null,
    portal: d.portal || null,
    servicos: mandato.servicos,
    orgaos: d.orgaos || null,
    bio: d.bio || null,
    temas: d.temas || null,
  };
  const gerado = {
    conhecimento: montarConhecimentoDoMandato(dados),
    prompt: montarPromptDoMandato(dados),
    gerado_em: new Date().toISOString(),
  };

  const novo = {
    ...settings,
    [CHAVE_GABINETE]: {
      ...gabinete,
      [CHAVE_SETUP_COMPLETO]: true,
      [CHAVE_MANDATO]: mandato,
      [CHAVE_MANDATO_GERADO]: gerado,
    },
  };

  const { error } = await admin.from("organizations").update({ settings: novo }).eq("id", org.orgId);
  if (error) return { ok: false, error: "erro_ao_gravar" };

  await audit({
    action: "pol_gabinete.setup_salvo",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "organization",
    resourceId: org.orgId,
    metadata: { tipo: d.tipo, servicos: d.servicos.length },
  });

  revalidatePath("/app/politico");
  revalidatePath("/app/politico/configuracao");
  return { ok: true };
}

/**
 * "Fazer isso depois" — marca que o admin adiou o assistente, para o sistema
 * parar de abrir nele a cada entrada (anti-loop). NÃO marca como concluído: a
 * configuração segue pendente e pode ser retomada. Gate ADMIN.
 */
export async function adiarSetupDoMandato(): Promise<ResultadoSetup> {
  const user = await loadAuthUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (supportWriteError(user.support)) return { ok: false, error: "forbidden_role" };
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, error: "forbidden_tenant" };
  if (ROLE_RANK[org.role] < ROLE_RANK.admin) return { ok: false, error: "forbidden_role" };

  const admin = createAdminClient();
  const { data: atual, error: erroLeitura } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", org.orgId)
    .maybeSingle();
  if (erroLeitura) return { ok: false, error: "erro_ao_gravar" };

  const settings = (atual?.settings ?? {}) as Record<string, unknown>;
  const gabinete = (settings[CHAVE_GABINETE] ?? {}) as Record<string, unknown>;
  const novo = { ...settings, [CHAVE_GABINETE]: { ...gabinete, [CHAVE_SETUP_ADIADO]: true } };

  const { error } = await admin.from("organizations").update({ settings: novo }).eq("id", org.orgId);
  if (error) return { ok: false, error: "erro_ao_gravar" };

  revalidatePath("/app/politico");
  return { ok: true };
}
