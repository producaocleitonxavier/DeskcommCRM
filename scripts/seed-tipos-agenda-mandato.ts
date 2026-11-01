/**
 * Semeia os TIPOS DE COMPROMISSO do mandato na Agenda (calendar_event_types),
 * para a Agenda do Gabinete nascer "pronta pra apontar" com o vocabulário certo:
 * Reunião, Visita, Audiência, Evento, Ligação, Compromisso.
 *
 * Por que aqui e não na migration 0185: aquele é o PISO neutro (Consulta,
 * Reunião, Atendimento) que serve a qualquer nicho; o enriquecimento por nicho
 * vive onde o nicho existe (este script, rodado por org política). Idempotente
 * por (organization_id, slug) via `on conflict do nothing` — nunca sobrescreve o
 * que o gabinete já editou, e pode rodar N vezes.
 *
 * `category` fica dentro do CHECK de calendar_event_types (migration 0177):
 * consulta|procedimento|retorno|visita|vistoria|reuniao|call|orcamento|demonstracao|outro.
 *
 * Uso:  npx tsx scripts/seed-tipos-agenda-mandato.ts --org <uuid-da-organizacao>
 */

import { createClient } from "@supabase/supabase-js";

import { anunciarDestino, credenciaisSupabaseDeTeste } from "./lib/env-de-teste";

interface TipoDeMandato {
  name: string;
  slug: string;
  category: string;
  duration_minutes: number;
  position: number;
  color: string;
}

/** Cores vindas do antigo visualizador (TIPO_CFG), em #RRGGBB (exigência do CHECK). */
const TIPOS_DO_MANDATO: readonly TipoDeMandato[] = [
  { name: "Reunião", slug: "reuniao", category: "reuniao", duration_minutes: 60, position: 4000, color: "#9AA5EA" },
  { name: "Visita", slug: "visita", category: "visita", duration_minutes: 60, position: 4100, color: "#22C55E" },
  { name: "Audiência", slug: "audiencia", category: "outro", duration_minutes: 60, position: 4200, color: "#A78BFA" },
  { name: "Evento", slug: "evento", category: "outro", duration_minutes: 120, position: 4300, color: "#F472B6" },
  { name: "Ligação", slug: "ligacao", category: "call", duration_minutes: 15, position: 4400, color: "#38BDF8" },
  { name: "Compromisso", slug: "compromisso", category: "outro", duration_minutes: 60, position: 4500, color: "#9CA3AF" },
];

function orgDoArgv(): string {
  const i = process.argv.indexOf("--org");
  const valor = i >= 0 ? process.argv[i + 1] : undefined;
  if (!valor || !/^[0-9a-f-]{36}$/i.test(valor)) {
    throw new Error("Passe --org <uuid-da-organizacao>. Ex.: npx tsx scripts/seed-tipos-agenda-mandato.ts --org 1234...");
  }
  return valor;
}

async function main(): Promise<void> {
  const orgId = orgDoArgv();
  const cred = credenciaisSupabaseDeTeste();
  anunciarDestino("seed-tipos-agenda-mandato", cred);

  const admin = createClient(cred.url, cred.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let criados = 0;
  for (const tipo of TIPOS_DO_MANDATO) {
    // `ignoreDuplicates: true` = INSERT ... ON CONFLICT DO NOTHING (não sobrescreve).
    const { data, error } = await admin
      .from("calendar_event_types")
      .upsert({ organization_id: orgId, ...tipo }, { onConflict: "organization_id,slug", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`tipo "${tipo.name}": ${error.message}`);
    if (data && data.length > 0) criados += 1;
  }

  console.info(`[seed-tipos-agenda-mandato] org ${orgId}: ${criados} tipo(s) novo(s), ${TIPOS_DO_MANDATO.length - criados} já existia(m).`);
}

main().catch((err) => {
  console.error("❌ Seed de tipos de agenda do mandato falhou:", err);
  process.exit(1);
});
