/**
 * Migra os compromissos da antiga "Agenda do mandato" (pol_agenda) para a Agenda
 * completa do Gabinete (calendar_appointments), depois da fusão das duas agendas.
 *
 * Rede de segurança: se o gabinete nunca usou a Agenda do mandato, pol_agenda
 * está vazia e isto é um no-op. Idempotente por chave natural
 * (organization_id + title + starts_at): rodar N vezes não duplica.
 *
 * Mapeamento:
 *   titulo            → title
 *   tipo (slug)       → event_type_id (procura em calendar_event_types por slug)
 *   data_inicio       → starts_at
 *   data_fim | +dur   → ends_at (ends_at > starts_at é obrigatório)
 *   dia_inteiro       → ends_at = início + 1 dia quando não há data_fim
 *   status            → pending | confirmed | completed | cancelled
 *   local + municipio → location_details
 *
 * Uso:  npx tsx scripts/migrar-pol-agenda-para-agendamentos.ts --org <uuid>
 */

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { anunciarDestino, credenciaisSupabaseDeTeste } from "./lib/env-de-teste";

const HORA_MS = 3_600_000;
const DIA_MS = 86_400_000;

/** pol_agenda.status → calendar_appointments.status (dentro do CHECK). */
const STATUS: Record<string, string> = {
  agendado: "pending",
  confirmado: "confirmed",
  concluido: "completed",
  cancelado: "cancelled",
};

interface LinhaPolAgenda {
  id: string;
  titulo: string | null;
  tipo: string | null;
  data_inicio: string;
  data_fim: string | null;
  dia_inteiro: boolean | null;
  status: string | null;
  local: string | null;
  municipio: string | null;
}

function orgDoArgv(): string {
  const i = process.argv.indexOf("--org");
  const valor = i >= 0 ? process.argv[i + 1] : undefined;
  if (!valor || !/^[0-9a-f-]{36}$/i.test(valor)) {
    throw new Error("Passe --org <uuid-da-organizacao>.");
  }
  return valor;
}

/** Mapa slug → id dos tipos de agendamento da org (para casar pol_agenda.tipo). */
async function tiposPorSlug(admin: SupabaseClient, orgId: string): Promise<Map<string, string>> {
  const { data, error } = await admin
    .from("calendar_event_types")
    .select("id, slug")
    .eq("organization_id", orgId);
  if (error) throw new Error(`ler tipos: ${error.message}`);
  const m = new Map<string, string>();
  for (const t of (data ?? []) as { id: string; slug: string }[]) m.set(t.slug, t.id);
  return m;
}

function fimDe(linha: LinhaPolAgenda): string {
  if (linha.data_fim) return linha.data_fim;
  const ini = new Date(linha.data_inicio).getTime();
  const fim = linha.dia_inteiro ? ini + DIA_MS : ini + HORA_MS;
  return new Date(fim).toISOString();
}

async function main(): Promise<void> {
  const orgId = orgDoArgv();
  const cred = credenciaisSupabaseDeTeste();
  anunciarDestino("migrar-pol-agenda-para-agendamentos", cred);

  const admin = createClient(cred.url, cred.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: linhas, error } = await admin
    .from("pol_agenda")
    .select("id, titulo, tipo, data_inicio, data_fim, dia_inteiro, status, local, municipio")
    .eq("organization_id", orgId)
    .order("data_inicio", { ascending: true });
  if (error) throw new Error(`ler pol_agenda: ${error.message}`);

  const fonte = (linhas ?? []) as LinhaPolAgenda[];
  if (fonte.length === 0) {
    console.info(`[migrar-pol-agenda] org ${orgId}: pol_agenda vazia — nada a migrar.`);
    return;
  }

  const tipos = await tiposPorSlug(admin, orgId);
  let migrados = 0;
  let pulados = 0;

  for (const linha of fonte) {
    const title = (linha.titulo ?? "").trim() || "Compromisso";
    const starts_at = linha.data_inicio;

    // Idempotência por chave natural: já existe um compromisso igual?
    const { data: existente } = await admin
      .from("calendar_appointments")
      .select("id")
      .eq("organization_id", orgId)
      .eq("title", title)
      .eq("starts_at", starts_at)
      .limit(1)
      .maybeSingle();
    if (existente) {
      pulados += 1;
      continue;
    }

    const status = STATUS[(linha.status ?? "").toLowerCase()] ?? "confirmed";
    const local = [linha.local, linha.municipio].map((s) => (s ?? "").trim()).filter(Boolean).join(" · ");

    const insert: Record<string, unknown> = {
      organization_id: orgId,
      event_type_id: linha.tipo ? (tipos.get(linha.tipo) ?? null) : null,
      title,
      starts_at,
      ends_at: fimDe(linha),
      status,
      location_details: local || null,
      source: "ui",
      created_by_kind: "system",
    };
    // O CHECK amarra status cancelado a cancelled_at preenchido.
    if (status === "cancelled") insert.cancelled_at = linha.data_inicio;

    const { error: erroInsert } = await admin.from("calendar_appointments").insert(insert);
    if (erroInsert) throw new Error(`migrar "${title}": ${erroInsert.message}`);
    migrados += 1;
  }

  console.info(`[migrar-pol-agenda] org ${orgId}: ${migrados} migrado(s), ${pulados} já existia(m), de ${fonte.length} na origem.`);
}

main().catch((err) => {
  console.error("❌ Migração pol_agenda → agendamentos falhou:", err);
  process.exit(1);
});
