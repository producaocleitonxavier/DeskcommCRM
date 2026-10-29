/**
 * INDICAÇÃO (member-get-member) — o OURO do funil.
 *
 * Cada pessoa engajada ganha um CÓDIGO pessoal. Ela compartilha o link que abre
 * NOSSA conversa com `[ind:CODE]` já escrito (sem link de download — é receptivo,
 * confiável). Quem chega com esse código é creditado a ela (`pol_indicacoes`),
 * e medimos "quantas pessoas ela trouxe" — o sinal mais forte (Multiplicador).
 *
 * FAIL-SOFT: nunca lança (chamadores são handlers de evento).
 */
import { randomInt } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { lerIdentidadeDoMandato, novidadesDeLabel } from "@/lib/politico/identidade-do-mandato";
import { enviarTextoNoCanal } from "@/lib/politico/enviar-material";
import { recomputarEngajamento } from "@/lib/politico/engajamento";

/** `[ind:CODE]` — prefixo próprio (distinto de [qr:] de ponto e [ref:] de anúncio). */
export const PADRAO_INDICACAO = /\[ind:([A-Z0-9]{4,12})\]/i;

export function extrairCodigoIndicacao(texto: string | null): string | null {
  if (!texto) return null;
  const m = PADRAO_INDICACAO.exec(texto);
  return m ? m[1]!.toUpperCase() : null;
}

// Alfabeto sem ambíguos (0/O, 1/I/L) — o código às vezes é lido/digitado.
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function gerarCodigo(tam = 6): string {
  let s = "";
  for (let i = 0; i < tam; i++) s += ALFABETO[randomInt(ALFABETO.length)];
  return s;
}

/**
 * O código pessoal do contato — pega o que já existe ou gera um único na org.
 * Retorna `{codigo, novo}`: `novo=true` SÓ quando ESTA chamada criou o código
 * (venceu o compare-and-set) — é o que desempata a corrida do convite (só quem
 * criou envia o "indica aqui", evitando convite em dobro). `codigo=null` se falhou.
 */
export async function codigoDeIndicacao(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
): Promise<{ codigo: string | null; novo: boolean }> {
  try {
    const { data: atual } = await admin
      .from("contacts")
      .select("codigo_indicacao")
      .eq("organization_id", organizationId)
      .eq("id", contactId)
      .maybeSingle();
    const existente = (atual as { codigo_indicacao: string | null } | null)?.codigo_indicacao;
    if (existente) return { codigo: existente, novo: false };

    for (let tentativa = 0; tentativa < 6; tentativa++) {
      const codigo = gerarCodigo();
      const { data, error } = await admin
        .from("contacts")
        .update({ codigo_indicacao: codigo })
        .eq("organization_id", organizationId)
        .eq("id", contactId)
        .is("codigo_indicacao", null)
        .select("codigo_indicacao")
        .maybeSingle();
      if (!error && data) return { codigo: (data as { codigo_indicacao: string }).codigo_indicacao, novo: true };
      // Conflito de unicidade (23505) → tenta outro código. Corrida que já gravou → relê.
      if (error && error.code === "23505") continue;
      const { data: relido } = await admin
        .from("contacts")
        .select("codigo_indicacao")
        .eq("organization_id", organizationId)
        .eq("id", contactId)
        .maybeSingle();
      const c = (relido as { codigo_indicacao: string | null } | null)?.codigo_indicacao;
      if (c) return { codigo: c, novo: false };
    }
    return { codigo: null, novo: false };
  } catch (err) {
    logger.warn("[indicacao] falha ao obter código", { organization_id: organizationId, contact_id: contactId, detail: err instanceof Error ? err.message.slice(0, 120) : "?" });
    return { codigo: null, novo: false };
  }
}

export interface ResultadoIndicacao {
  creditou: boolean;
  indicadorContactId?: string;
  motivo?: string;
}

/**
 * Credita a indicação: resolve o CÓDIGO → indicador, grava `pol_indicacoes`
 * (first-touch, não-self), e recalcula o engajamento do INDICADOR (+10). Não
 * lança. `indicadoContactId` é quem chegou com o código.
 */
export async function registrarIndicacao(
  admin: SupabaseClient,
  organizationId: string,
  indicadoContactId: string,
  codigo: string,
): Promise<ResultadoIndicacao> {
  try {
    const { data: ind } = await admin
      .from("contacts")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("codigo_indicacao", codigo)
      .maybeSingle();
    const indicador = (ind as { id: string } | null)?.id;
    if (!indicador) return { creditou: false, motivo: "codigo_desconhecido" };
    if (indicador === indicadoContactId) return { creditou: false, motivo: "auto_indicacao" };

    const { error } = await admin.from("pol_indicacoes").insert({
      organization_id: organizationId,
      indicador_contact_id: indicador,
      indicado_contact_id: indicadoContactId,
    });
    if (error) {
      // Unique (indicado já creditado) ou check (self) — já contabilizado, encerra.
      if (error.code === "23505" || error.code === "23514") return { creditou: false, indicadorContactId: indicador, motivo: "ja_creditado" };
      return { creditou: false, motivo: error.message.slice(0, 80) };
    }

    // O indicador ganhou um indicado → recalcula o índice dele (+10).
    await recomputarEngajamento(admin, organizationId, indicador, { reason: "Trouxe um novo cadastro" });
    return { creditou: true, indicadorContactId: indicador };
  } catch (err) {
    logger.warn("[indicacao] falhou (segue normal)", { organization_id: organizationId, detail: err instanceof Error ? err.message.slice(0, 120) : "?" });
    return { creditou: false, motivo: "excecao" };
  }
}

/**
 * Quem CHEGOU por indicação (`[ind:CODE]`): credita o indicador, cria o lead do
 * novo contato (simpatizante), marca a origem e acolhe. O material vem pelo
 * atendimento/próximo disparo — aqui o foco é creditar + acolher.
 */
export async function processarIndicacao(
  admin: SupabaseClient,
  entrada: { organizationId: string; contactId: string; codigo: string; canalId: string | null },
): Promise<{ status: "ok" | "skipped" | "error"; detail: string }> {
  const { organizationId, contactId, codigo, canalId } = entrada;
  const r = await registrarIndicacao(admin, organizationId, contactId, codigo);
  if (!r.indicadorContactId && r.motivo === "codigo_desconhecido") {
    return { status: "skipped", detail: `codigo_desconhecido:${codigo}` };
  }

  // Cria o lead do novo contato (idempotente) e marca a origem (first-touch).
  const { data: leadExiste } = await admin
    .from("pol_leads").select("id")
    .eq("organization_id", organizationId).eq("contact_id", contactId).maybeSingle();
  if (!leadExiste) {
    const { error } = await admin.from("pol_leads").insert({
      organization_id: organizationId, contact_id: contactId, support_level: "simpatizante",
    });
    if (error && error.code !== "23505") logger.warn("[indicacao] criar lead do indicado falhou", { detail: error.message });
  }
  await admin.from("contacts").update({ source: "Indicação" })
    .eq("organization_id", organizationId).eq("id", contactId).or("source.is.null,source.eq.");

  await recomputarEngajamento(admin, organizationId, contactId, { reason: "Chegou por indicação", engajouAgora: true });

  // Acolhe o novo contato (só se for crédito novo e houver canal).
  if (r.creditou && canalId) {
    const idm = await lerIdentidadeDoMandato(admin, organizationId);
    await enviarTextoNoCanal(admin, {
      organizationId, contactId, canalId,
      texto: `Oi! Que bom ter você com a gente 🙏 Já te coloquei pra receber os materiais e ${novidadesDeLabel(idm)}. Qualquer coisa, é só me chamar por aqui!`,
      rotulo: "indicacao-acolhe",
    });
  }
  return { status: "ok", detail: r.creditou ? `creditado:${r.indicadorContactId}` : (r.motivo ?? "sem_credito") };
}

/**
 * Convida a pessoa a INDICAR — manda, UMA vez (na 1ª entrega de material), o
 * link pessoal dela pra compartilhar. O link abre NOSSA conversa com `[ind:CODE]`
 * já escrito (receptivo, sem download). Best-effort, não lança.
 */
export async function convidarAIndicar(
  admin: SupabaseClient,
  entrada: { organizationId: string; contactId: string; canalId: string | null },
): Promise<void> {
  const { organizationId, contactId, canalId } = entrada;
  try {
    if (!canalId) return;
    // Só convida uma vez: se já tem código, já foi convidado.
    const { data: c } = await admin
      .from("contacts").select("codigo_indicacao")
      .eq("organization_id", organizationId).eq("id", contactId).maybeSingle();
    if ((c as { codigo_indicacao: string | null } | null)?.codigo_indicacao) return;

    const { codigo, novo } = await codigoDeIndicacao(admin, organizationId, contactId);
    // Só quem CRIOU o código agora envia o convite — se outra chamada (corrida)
    // criou, ela envia; esta encerra, sem convite em dobro.
    if (!codigo || !novo) return;
    const { data: ch } = await admin
      .from("channel_sessions").select("phone_number")
      .eq("organization_id", organizationId).eq("id", canalId).maybeSingle();
    const numero = (ch as { phone_number: string | null } | null)?.phone_number;
    if (!numero) return;

    const idm = await lerIdentidadeDoMandato(admin, organizationId);
    const textoPreenchido = `Olá! Me indicaram e quero receber os materiais e ${novidadesDeLabel(idm)}. [ind:${codigo}]`;
    const link = `https://wa.me/${numero.replace(/\D+/g, "")}?text=${encodeURIComponent(textoPreenchido)}`;
    await enviarTextoNoCanal(admin, {
      organizationId, contactId, canalId,
      texto: `💚 Curtiu? Indica pra quem precisa — é só a pessoa me chamar por aqui: ${link}`,
      rotulo: "indicacao-convite",
    });
  } catch (err) {
    logger.warn("[indicacao] convite falhou (segue normal)", { organization_id: organizationId, detail: err instanceof Error ? err.message.slice(0, 120) : "?" });
  }
}
