"use server";

/**
 * "Avisos do Instagram": liga (e confere) a inscrição da conta conectada nos
 * webhooks do aplicativo — sem ela, comentário e DM não chegam ao sistema mesmo
 * com o endereço configurado no painel da Meta. Ver `lib/channels/instagram/inscricao.ts`.
 *
 * Organização SEMPRE da sessão; a credencial é a da conexão de Instagram ativa
 * dessa organização. Só gestor liga.
 */

import { resolveActiveOrg } from "@/lib/auth/server";
import { igCredsForChannelSessionId } from "@/lib/channels/instagram/credentials";
import { CAMPOS_DE_AVISO, inscreverContaNosAvisos, lerInscricaoDaConta } from "@/lib/channels/instagram/inscricao";
import { autenticarComPapel } from "@/lib/politico/acesso";
import { createAdminClient } from "@/lib/supabase/admin";

export type EstadoDosAvisos =
  | { ok: true; ligados: boolean; campos: string[] }
  | { ok: false; erro: string };

async function credencialDaOrg() {
  const user = await autenticarComPapel("manager");
  const org = await resolveActiveOrg(user);
  if (!org) return null;
  const admin = createAdminClient();
  const { data: sessao } = await admin
    .from("channel_sessions")
    .select("id")
    .eq("organization_id", org.orgId)
    .eq("provider", "instagram")
    .eq("status", "WORKING")
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  if (!sessao?.id) return null;
  return igCredsForChannelSessionId(admin, org.orgId, sessao.id as string);
}

function resumo(campos: string[]): EstadoDosAvisos {
  return { ok: true, ligados: CAMPOS_DE_AVISO.every((c) => campos.includes(c)), campos };
}

export async function lerAvisosDoInstagram(): Promise<EstadoDosAvisos> {
  const creds = await credencialDaOrg();
  if (!creds) return { ok: false, erro: "Nenhuma conta do Instagram conectada." };
  const r = await lerInscricaoDaConta(creds);
  return r.ok ? resumo(r.campos) : { ok: false, erro: `A Meta não respondeu: ${r.erro}` };
}

export async function ligarAvisosDoInstagram(): Promise<EstadoDosAvisos> {
  const creds = await credencialDaOrg();
  if (!creds) return { ok: false, erro: "Nenhuma conta do Instagram conectada." };
  const r = await inscreverContaNosAvisos(creds);
  if (!r.ok) return { ok: false, erro: `A Meta recusou: ${r.erro}` };
  // Confere lendo de volta — "liguei" só vale se a Meta confirma.
  const lido = await lerInscricaoDaConta(creds);
  return lido.ok ? resumo(lido.campos) : resumo(r.campos);
}
