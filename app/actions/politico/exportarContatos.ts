"use server";

/**
 * EXPORTAÇÃO organizada da base de contatos (político) → CSV limpo.
 *
 * Gera um arquivo que o Excel abre com colunas certinhas (BOM UTF-8 pros
 * acentos). Junta contato + vínculo eleitoral (pol_leads) + cidade/bairro de
 * custom_fields. CPF NÃO sai (fica cifrado no banco, por LGPD). Devolve o
 * conteúdo pro navegador baixar.
 *
 * `organization_id` vem de resolveActiveOrg (nunca do input). Pagina de 1000 em
 * 1000 (teto do PostgREST) até um limite de segurança.
 */
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createAdminClient } from "@/lib/supabase/admin";

export type ResultadoExport = { ok: true; csv: string; nome: string; total: number } | { ok: false; erro: string };

const TETO = 50_000;

function esc(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function dataBR(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR");
}
const prettyNivel = (s: string | null) => (s ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export async function exportarContatos(): Promise<ResultadoExport> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  if (ROLE_RANK[org.role] < ROLE_RANK.agent) return { ok: false, erro: "Sem permissão." };
  const orgId = org.orgId;
  const admin = createAdminClient();

  // Vínculo eleitoral por contato (support_level, temperatura, zona/seção).
  const leads = new Map<string, { nivel: string | null; temp: string | null; zona: string | null; secao: string | null }>();
  for (let de = 0; de < TETO; de += 1000) {
    const { data, error } = await admin
      .from("pol_leads")
      .select("contact_id, support_level, temperature, zona_eleitoral, secao_eleitoral")
      .eq("organization_id", orgId)
      .range(de, de + 999);
    if (error) break;
    for (const l of (data ?? []) as { contact_id: string; support_level: string | null; temperature: string | null; zona_eleitoral: string | null; secao_eleitoral: string | null }[]) {
      leads.set(l.contact_id, { nivel: l.support_level, temp: l.temperature, zona: l.zona_eleitoral, secao: l.secao_eleitoral });
    }
    if (!data || data.length < 1000) break;
  }

  const colunas = [
    "Nome", "Telefone", "E-mail", "Cidade", "Bairro", "UF", "Nascimento",
    "Nível de apoio", "Temperatura", "Zona eleitoral", "Seção eleitoral", "Etiquetas", "Cadastrado em",
  ];
  const linhas: string[] = [colunas.join(",")];
  let total = 0;

  for (let de = 0; de < TETO; de += 1000) {
    const { data, error } = await admin
      .from("contacts")
      .select("id, name, phone_number, email, birthdate, tags, custom_fields, created_at")
      .eq("organization_id", orgId)
      .is("is_merged_into", null)
      .eq("is_anonymized", false)
      .order("name", { ascending: true })
      .range(de, de + 999);
    if (error) return { ok: false, erro: error.message };
    const rows = (data ?? []) as {
      id: string; name: string | null; phone_number: string | null; email: string | null;
      birthdate: string | null; tags: string[] | null; custom_fields: Record<string, unknown> | null; created_at: string;
    }[];
    for (const c of rows) {
      const end = (c.custom_fields?.endereco_gip ?? {}) as Record<string, string>;
      const lead = leads.get(c.id);
      linhas.push([
        esc(c.name), esc(c.phone_number), esc(c.email),
        esc(end.cidade ?? ""), esc(end.bairro ?? ""), esc(end.estado ?? ""),
        esc(dataBR(c.birthdate)),
        esc(prettyNivel(lead?.nivel ?? null)), esc(lead?.temp ?? ""),
        esc(lead?.zona ?? ""), esc(lead?.secao ?? ""),
        esc((c.tags ?? []).join("; ")), esc(dataBR(c.created_at)),
      ].join(","));
      total += 1;
    }
    if (rows.length < 1000) break;
  }

  // BOM UTF-8: faz o Excel abrir os acentos certos.
  const csv = "﻿" + linhas.join("\r\n");
  const hoje = new Date().toISOString().slice(0, 10);
  return { ok: true, csv, nome: `contatos-${hoje}.csv`, total };
}
