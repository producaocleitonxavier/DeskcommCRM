/**
 * Semeia a regra de automação "Felicitação de aniversário" (mensagem de VOZ) para
 * UMA organização, DESLIGADA por padrão (is_active=false) — quem liga é o cliente,
 * em Operação › Regras automáticas. Idempotente por (organization_id, name):
 * rodar de novo não duplica nem reativa.
 *
 * Resolve sozinho o número de WhatsApp da org (channel_sessions provider='waha'
 * não arquivado). Sem canal, aborta com mensagem clara — regra com
 * channel_session_id inexistente falharia em todo aniversário.
 *
 * Como o infra de aniversário mora no cron + no evento `contact.birthday`, a
 * regra só começa a "ouvir" quando ligada; e o áudio só sai se a Voz do Mandato
 * estiver armada (clone + consentimento) e fora do blackout eleitoral — travas
 * estruturais na ação `send_voice_recado`.
 *
 * Run: npx tsx scripts/seed-regra-aniversario.ts --org <uuid> [--permitir-remoto] [--ativar]
 */
import { createClient } from "@supabase/supabase-js";

import { anunciarDestino, credenciaisSupabaseDeTeste, destinoEhLocal } from "./lib/env-de-teste";
import { regraAniversarioDeVoz } from "@/lib/operacao/regras-de-fabrica";

function arg(nome: string): string | null {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const orgId = arg("--org");
const ativar = process.argv.includes("--ativar");
if (!orgId) {
  console.error("Faltou --org <uuid>. Uso: npx tsx scripts/seed-regra-aniversario.ts --org <uuid> [--permitir-remoto] [--ativar]");
  process.exit(2);
}

const credenciais = credenciaisSupabaseDeTeste();
anunciarDestino("seed-regra-aniversario", credenciais);

if (!destinoEhLocal(credenciais.url) && !process.argv.includes("--permitir-remoto")) {
  console.error(
    `[seed-regra-aniversario] recusado: ${credenciais.url} não é local, e este seed cria uma ` +
      "regra de automação. Para gravar mesmo assim, rode de novo com --permitir-remoto.",
  );
  process.exit(2);
}

const admin = createClient(credenciais.url, credenciais.serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main(): Promise<void> {
  // O número de WhatsApp (waha) não arquivado da org — o que "fala" no áudio.
  const { data: sessoes, error: erroSessao } = await admin
    .from("channel_sessions")
    .select("id, status, archived_at, created_at")
    .eq("organization_id", orgId!)
    .eq("provider", "waha")
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (erroSessao) throw new Error(`channel_sessions: ${erroSessao.message}`);

  const sessao = (sessoes ?? [])[0] as { id: string; status: string } | undefined;
  if (!sessao) {
    console.error(
      "[seed-regra-aniversario] nenhum canal de WhatsApp (provider waha) ativo nesta org — " +
        "conecte um canal antes de criar a regra.",
    );
    process.exit(1);
  }

  const regra = regraAniversarioDeVoz(sessao.id);

  const { data: existente } = await admin
    .from("automation_rules")
    .select("id, is_active")
    .eq("organization_id", orgId!)
    .eq("name", regra.name)
    .maybeSingle();

  if (existente) {
    const e = existente as { id: string; is_active: boolean };
    console.info(`[seed-regra-aniversario] regra "${regra.name}" já existe (id ${e.id}, ativa=${e.is_active}) — nada a fazer.`);
    return;
  }

  const { data, error } = await admin
    .from("automation_rules")
    .insert({ organization_id: orgId!, is_active: ativar, ...regra })
    .select("id")
    .single();
  if (error) throw new Error(`criar regra: ${error.message}`);

  console.info(
    `✅ Regra "${regra.name}" criada (id ${(data as { id: string }).id}), is_active=${ativar}, ` +
      `canal ${sessao.id} (status ${sessao.status}). ${ativar ? "" : "DESLIGADA — ligue em Operação quando quiser."}`,
  );
}

main().catch((err) => {
  console.error("❌ seed-regra-aniversario falhou:", err);
  process.exit(1);
});
