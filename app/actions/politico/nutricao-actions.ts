"use server";

/**
 * Nutrição mensal — a porta de ligar/desligar da cadência "uma mensagem por mês"
 * para quem se aproximou do mandato (graduou a simpatizante). O motor já existia
 * (`lib/politico/eventos-envio/*` + `drip-engajamento`); faltava um lugar para o
 * gabinete escolher o NÚMERO, escrever os TEXTOS e virar o INTERRUPTOR.
 *
 * Regras que não se negociam:
 *  - organização vem SEMPRE da sessão (nunca do corpo);
 *  - nasce desligada; ligar exige número escolhido e textos publicados;
 *  - ligar NÃO inscreve ninguém retroativamente — só quem graduar a partir daí;
 *  - o envio continua passando por todas as travas do canal (go-live, horário,
 *    ritmo, pedido de saída). Esta tela não fura nenhuma.
 */

import { z } from "zod";

import { resolveActiveOrg } from "@/lib/auth/server";
import { autenticarComPapel } from "@/lib/politico/acesso";
import { TOQUES_DRIP_ENGAJAMENTO } from "@/lib/politico/drip-engajamento";
import { lerEventosEnvioConfig } from "@/lib/politico/eventos-envio/config";
import { publicarFluxosEventos } from "@/lib/politico/eventos-envio/publicar";
import { createAdminClient } from "@/lib/supabase/admin";

export interface CanalDaNutricao {
  id: string;
  rotulo: string;
  funcionando: boolean;
  /** Há um aviso de go-live aberto para este número: envios do sistema ficam segurados. */
  segurado: boolean;
}

export interface EstadoDaNutricao {
  ligada: boolean;
  canalId: string | null;
  publicada: boolean;
  textos: string[];
  canais: CanalDaNutricao[];
  /** Quantas pessoas já entraram na cadência. */
  jaEntraram: number;
}

type Resultado = { ok: true } | { ok: false; erro: string };

async function contexto() {
  const user = await autenticarComPapel("manager");
  const org = await resolveActiveOrg(user);
  if (!org) return null;
  return { user, orgId: org.orgId, admin: createAdminClient() };
}

function rotuloDoCanal(c: { display_name: string | null; phone_number: string | null }): string {
  const fim = (c.phone_number ?? "").replace(/\D/g, "").slice(-4);
  const nome = (c.display_name ?? "").trim();
  if (nome && fim) return `${nome} · final ${fim}`;
  if (nome) return nome;
  return fim ? `WhatsApp · final ${fim}` : "WhatsApp (número ainda não identificado)";
}

export async function lerNutricao(): Promise<EstadoDaNutricao | null> {
  const ctx = await contexto();
  if (!ctx) return null;
  const { admin, orgId } = ctx;

  const cfg = await lerEventosEnvioConfig(admin, orgId);

  const [{ data: sessoes }, { data: avisos }] = await Promise.all([
    admin
      .from("channel_sessions")
      .select("id, display_name, phone_number, status, provider, archived_at")
      .eq("organization_id", orgId)
      .eq("provider", "waha")
      .is("archived_at", null),
    admin
      .from("agent_inbox_items")
      .select("ref_id")
      .eq("organization_id", orgId)
      .eq("status", "open")
      .eq("ref_kind", "number_health"),
  ]);
  const segurados = new Set(((avisos ?? []) as { ref_id: string | null }[]).map((a) => a.ref_id).filter(Boolean));
  const canais: CanalDaNutricao[] = (
    (sessoes ?? []) as { id: string; display_name: string | null; phone_number: string | null; status: string }[]
  ).map((c) => ({ id: c.id, rotulo: rotuloDoCanal(c), funcionando: c.status === "WORKING", segurado: segurados.has(c.id) }));

  // Textos: os que estão publicados; se nunca publicou, o rascunho do gabinete.
  let textos: string[] = TOQUES_DRIP_ENGAJAMENTO.map((t) => t.texto);
  let jaEntraram = 0;
  if (cfg.dripPointerId) {
    const { data: ptr } = await admin
      .from("followup_flow_pointers")
      .select("draft_graph")
      .eq("organization_id", orgId)
      .eq("id", cfg.dripPointerId)
      .maybeSingle();
    const nodes = ((ptr?.draft_graph as { nodes?: { type?: string; config?: { body?: unknown } }[] } | null)?.nodes ?? []);
    const publicados = nodes
      .filter((n) => n.type === "action" && typeof n.config?.body === "string")
      .map((n) => String(n.config?.body));
    if (publicados.length > 0) textos = publicados;

    const { count } = await admin
      .from("followup_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("pointer_id", cfg.dripPointerId);
    jaEntraram = count ?? 0;
  }

  return {
    ligada: cfg.ativo,
    canalId: cfg.channelSessionId && canais.some((c) => c.id === cfg.channelSessionId) ? cfg.channelSessionId : null,
    publicada: !!cfg.dripPointerId,
    textos,
    canais,
    jaEntraram,
  };
}

const salvarSchema = z.object({
  textos: z.array(z.string().trim().min(20, "Cada mensagem precisa de pelo menos 20 letras.").max(600, "Cada mensagem pode ter até 600 letras.")).min(1).max(6),
  canalId: z.string().uuid().nullable(),
});

/** Grava os textos (publica a cadência) e o número escolhido. NÃO liga. */
export async function salvarNutricao(bruto: { textos: string[]; canalId: string | null }): Promise<Resultado> {
  const parsed = salvarSchema.safeParse(bruto);
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0]?.message ?? "Confira os textos." };
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: "Sessão ou organização inválida." };
  const { admin, orgId, user } = ctx;
  const { textos, canalId } = parsed.data;

  if (canalId) {
    const { data: canal } = await admin
      .from("channel_sessions")
      .select("id")
      .eq("organization_id", orgId)
      .eq("id", canalId)
      .eq("provider", "waha")
      .is("archived_at", null)
      .maybeSingle();
    if (!canal) return { ok: false, erro: "Esse número não está mais conectado. Escolha outro." };
  }

  const pub = await publicarFluxosEventos(admin, {
    orgId,
    createdBy: user.id,
    toques: textos.map((texto, i) => ({ rotulo: `Mês ${i + 1}`, texto })),
  });
  if (!pub.dripPointerId) return { ok: false, erro: "Não consegui gravar os textos. Nada foi alterado — tente de novo." };

  // Trocar ou tirar o número com a nutrição ligada desligaria a trava sem aviso:
  // sem número, desliga junto.
  const { error } = await admin
    .from("pol_eventos_envio_config")
    .upsert(
      {
        organization_id: orgId,
        drip_pointer_id: pub.dripPointerId,
        channel_session_id: canalId,
        ...(canalId ? {} : { ativo: false }),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" },
    );
  if (error) return { ok: false, erro: "Os textos foram gravados, mas não consegui guardar o número. Tente de novo." };
  return { ok: true };
}

/** Liga ou desliga. Ligar exige textos publicados e número escolhido. */
export async function ligarNutricao(ligar: boolean): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: "Sessão ou organização inválida." };
  const { admin, orgId } = ctx;

  if (ligar) {
    const cfg = await lerEventosEnvioConfig(admin, orgId);
    if (!cfg.dripPointerId) return { ok: false, erro: "Salve os textos antes de ligar." };
    if (!cfg.channelSessionId) return { ok: false, erro: "Escolha o número antes de ligar." };
    const { data: canal } = await admin
      .from("channel_sessions")
      .select("id")
      .eq("organization_id", orgId)
      .eq("id", cfg.channelSessionId)
      .is("archived_at", null)
      .maybeSingle();
    if (!canal) return { ok: false, erro: "O número escolhido não está mais conectado. Escolha outro e salve." };
  }

  const { error } = await admin
    .from("pol_eventos_envio_config")
    .upsert({ organization_id: orgId, ativo: ligar, updated_at: new Date().toISOString() }, { onConflict: "organization_id" });
  if (error) return { ok: false, erro: "Não consegui mudar o interruptor. Tente de novo." };
  return { ok: true };
}
