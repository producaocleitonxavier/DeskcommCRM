/**
 * /app/politico/liderancas — Gabinete Digital: Lideranças (War Room 2.0)
 *
 * Server component: auth + fetch (pol_liderancas, todos os status). O visual
 * (KPIs, aniversários, cards) vive em ./_liderancas-client.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import LiderancasClient from "./_liderancas-client";

export const dynamic = "force-dynamic";

export interface Lideranca {
  id: string;
  nome: string;
  apelido: string | null;
  cargo: string | null;
  tipo: string;
  whatsapp: string | null;
  aniversario: string | null;
  cidade: string | null;
  bairro: string | null;
  leads_mobilizados: number;
  eventos_organizados: number;
  nivel_engajamento: string;
  status: string;
  ultimo_contato_em: string | null;
  foto_path: string | null;
  fotoUrl: string | null;
}

async function buscarLiderancas(organizationId: string): Promise<Lideranca[]> {
  const db = await createClient();
  const [{ data }, { data: leads }, { data: eventos }] = await Promise.all([
    db
      .from("pol_liderancas")
      .select(
        "id, nome, apelido, cargo, tipo, whatsapp, aniversario, cidade, bairro, leads_mobilizados, eventos_organizados, nivel_engajamento, status, ultimo_contato_em, foto_path",
      )
      .eq("organization_id", organizationId)
      .order("status", { ascending: true })
      .order("nome", { ascending: true }),
    // Pessoas indicadas por liderança (ao vivo) — só os leads atribuídos.
    db
      .from("pol_leads")
      .select("pol_lideranca_id")
      .eq("organization_id", organizationId)
      .not("pol_lideranca_id", "is", null)
      .limit(20000),
    // Eventos da liderança (ao vivo) — compromissos tipo 'evento' na Agenda.
    db
      .from("pol_agenda")
      .select("lideranca_id")
      .eq("organization_id", organizationId)
      .eq("tipo", "evento")
      .not("lideranca_id", "is", null)
      .limit(5000),
  ]);

  const contarPessoas = new Map<string, number>();
  for (const l of (leads ?? []) as { pol_lideranca_id: string }[]) {
    contarPessoas.set(l.pol_lideranca_id, (contarPessoas.get(l.pol_lideranca_id) ?? 0) + 1);
  }
  const contarEventos = new Map<string, number>();
  for (const e of (eventos ?? []) as { lideranca_id: string }[]) {
    contarEventos.set(e.lideranca_id, (contarEventos.get(e.lideranca_id) ?? 0) + 1);
  }

  const linhas = (data ?? []) as Lideranca[];

  // Fotos: assina em LOTE (uma chamada) as que têm foto_path.
  const urlPorPath = new Map<string, string>();
  const paths = linhas.map((l) => l.foto_path).filter((p): p is string => !!p);
  if (paths.length > 0) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { data: signed } = await createAdminClient().storage.from("gabinete-liderancas").createSignedUrls(paths, 60 * 60);
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path) urlPorPath.set(s.path, s.signedUrl);
    }
  }

  // Sobrepõe os contadores estáticos (sempre 0) pelos números REAIS ao vivo + foto.
  return linhas.map((l) => ({
    ...l,
    leads_mobilizados: contarPessoas.get(l.id) ?? 0,
    eventos_organizados: contarEventos.get(l.id) ?? 0,
    fotoUrl: l.foto_path ? urlPorPath.get(l.foto_path) ?? null : null,
  }));
}

export default async function LiderancasPage() {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const liderancas = await buscarLiderancas(org.orgId);

  return <LiderancasClient liderancas={liderancas} />;
}
