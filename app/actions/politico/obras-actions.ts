"use server";

/**
 * Server actions do módulo Obras & Fiscalização. Satélites da tabela pol_obras:
 * vistorias (inspeções em campo com checklist/parecer/%) e fotos (evidências com
 * geo, bucket privado gabinete-obras). O CRUD da obra em si usa as actions
 * genéricas do gabinete (criarRegistro/atualizarRegistro/excluirRegistro em
 * "pol_obras"). organization_id vem sempre de resolveActiveOrg.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

export type AcaoResultado = { ok: true; id?: string } | { ok: false; erro: string };

export interface ChecklistItem { item: string; status: "ok" | "nao" | "na"; obs?: string }

export interface VistoriaObra {
  id: string;
  data: string;
  situacao: string;
  percentual: number | null;
  parecer: string | null;
  checklist: ChecklistItem[];
  responsavel: string | null;
  created_at: string;
}

export interface FotoObra {
  id: string;
  legenda: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  url: string | null; // assinada 1h
}

const BUCKET = "gabinete-obras";

function traduzErro(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "Já existe um registro com esse identificador.";
  if (error.code === "23514") return "Algum valor está fora do permitido para este campo.";
  return error.message;
}

/** Sugere a natureza do registro pelo cargo do mandato: Executivo gere (execucao), Legislativo fiscaliza. */
export async function sugestaoNatureza(): Promise<"execucao" | "fiscalizacao"> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return "fiscalizacao";
  const db = await createClient();
  const { data } = await db.from("pol_gabinete_config").select("cargo").eq("organization_id", org.orgId).maybeSingle();
  const cargo = String((data as { cargo?: string } | null)?.cargo ?? "").toLowerCase();
  return /prefeit|governad|vice/.test(cargo) ? "execucao" : "fiscalizacao";
}

/** Registra uma vistoria e, opcionalmente, atualiza o % de execução da obra. */
export async function registrarVistoria(
  obraId: string,
  dados: { data?: string; situacao: string; percentual?: number | null; parecer?: string; checklist?: ChecklistItem[]; responsavel?: string },
): Promise<AcaoResultado> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();
  const { data: nova, error } = await db
    .from("pol_obra_vistorias")
    .insert({
      organization_id: org.orgId,
      obra_id: obraId,
      data: dados.data || new Date().toISOString().slice(0, 10),
      situacao: dados.situacao,
      percentual: dados.percentual ?? null,
      parecer: dados.parecer ?? null,
      checklist: dados.checklist ?? [],
      responsavel: dados.responsavel ?? null,
      created_by: user.id,
    })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, erro: traduzErro(error) };
  // Espelha o % da vistoria na obra (fonte de verdade do progresso).
  if (typeof dados.percentual === "number") {
    await db.from("pol_obras").update({ percentual: dados.percentual, updated_at: new Date().toISOString() }).eq("id", obraId).eq("organization_id", org.orgId);
  }
  return { ok: true, id: (nova?.id as string | undefined) };
}

export async function listarVistorias(obraId: string): Promise<VistoriaObra[]> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return [];
  const db = await createClient();
  const { data } = await db
    .from("pol_obra_vistorias")
    .select("id, data, situacao, percentual, parecer, checklist, responsavel, created_at")
    .eq("organization_id", org.orgId)
    .eq("obra_id", obraId)
    .order("data", { ascending: false });
  return ((data ?? []) as Record<string, unknown>[]).map((v) => ({
    id: v.id as string,
    data: v.data as string,
    situacao: v.situacao as string,
    percentual: (v.percentual as number | null) ?? null,
    parecer: (v.parecer as string | null) ?? null,
    checklist: Array.isArray(v.checklist) ? (v.checklist as ChecklistItem[]) : [],
    responsavel: (v.responsavel as string | null) ?? null,
    created_at: v.created_at as string,
  }));
}

/** Upload de foto/documento de obra (multipart via FormData). Bucket privado. */
export async function uploadFotoObra(formData: FormData): Promise<AcaoResultado> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const obraId = String(formData.get("obraId") ?? "");
  const file = formData.get("file");
  if (!obraId || !(file instanceof File) || file.size === 0) return { ok: false, erro: "Arquivo inválido." };
  if (file.size > 20 * 1024 * 1024) return { ok: false, erro: "Arquivo acima de 20MB." };
  const legenda = (formData.get("legenda") as string | null) || null;
  const lat = formData.get("latitude") ? Number(formData.get("latitude")) : null;
  const lng = formData.get("longitude") ? Number(formData.get("longitude")) : null;
  const vistoriaId = (formData.get("vistoriaId") as string | null) || null;

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${org.orgId}/${obraId}/${crypto.randomUUID()}.${ext}`;
  const admin = createAdminClient();
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: file.type || "image/jpeg", upsert: false });
  if (upErr) return { ok: false, erro: "Falha no upload: " + upErr.message };

  const db = await createClient();
  const { error } = await db.from("pol_obra_fotos").insert({
    organization_id: org.orgId, obra_id: obraId, vistoria_id: vistoriaId,
    storage_path: path, legenda, latitude: lat, longitude: lng,
    media_mime: file.type || null, media_size_bytes: file.size, created_by: user.id,
  });
  if (error) {
    await admin.storage.from(BUCKET).remove([path]); // não deixa binário órfão
    return { ok: false, erro: traduzErro(error) };
  }
  return { ok: true };
}

export async function listarFotosObra(obraId: string): Promise<FotoObra[]> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return [];
  const db = await createClient();
  const { data } = await db
    .from("pol_obra_fotos")
    .select("id, storage_path, legenda, latitude, longitude, created_at")
    .eq("organization_id", org.orgId)
    .eq("obra_id", obraId)
    .order("created_at", { ascending: false });
  const linhas = (data ?? []) as { id: string; storage_path: string; legenda: string | null; latitude: number | null; longitude: number | null; created_at: string }[];
  if (linhas.length === 0) return [];
  const admin = createAdminClient();
  const out: FotoObra[] = [];
  for (const f of linhas) {
    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(f.storage_path, 60 * 60);
    out.push({ id: f.id, legenda: f.legenda, latitude: f.latitude, longitude: f.longitude, created_at: f.created_at, url: signed?.signedUrl ?? null });
  }
  return out;
}

// ─── Mandato TSE (vínculo da conta ao candidato do parlamentar) ──────────────
export interface MandatoTse { electionId: number; sq: string; nome: string }

export async function obterMandatoTse(): Promise<MandatoTse | null> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return null;
  const db = await createClient();
  const { data } = await db.from("pol_gabinete_config").select("tse_election_id, tse_sq_candidato, tse_candidato_nome").eq("organization_id", org.orgId).maybeSingle();
  const c = data as { tse_election_id?: number | null; tse_sq_candidato?: number | null; tse_candidato_nome?: string | null } | null;
  if (!c?.tse_election_id || !c?.tse_sq_candidato) return null;
  return { electionId: Number(c.tse_election_id), sq: String(c.tse_sq_candidato), nome: c.tse_candidato_nome ?? "" };
}

export async function salvarMandatoTse(electionId: number, sq: string, nome: string): Promise<AcaoResultado> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();
  const { error } = await db.from("pol_gabinete_config").upsert(
    { organization_id: org.orgId, tse_election_id: electionId, tse_sq_candidato: Number(sq), tse_candidato_nome: nome, updated_at: new Date().toISOString() },
    { onConflict: "organization_id" },
  );
  if (error) return { ok: false, erro: traduzErro(error) };
  return { ok: true };
}

export interface PesoBairro { meusVotos: number; universo: number; leads: number }

/** Peso eleitoral de um bairro para o candidato do mandato: seus votos ali, universo e seus leads. */
export async function pesoBairro(electionId: number, sq: string, municipioTse: string, bairro: string): Promise<PesoBairro | null> {
  await requireAuth();
  const db = await createClient();
  const { data, error } = await db.rpc("intel_peso_bairro", { p_election: electionId, p_sq: Number(sq), p_municipio: Number(municipioTse), p_bairro: bairro });
  if (error || !data || !Array.isArray(data) || data.length === 0) return null;
  const r = data[0] as { meus_votos: number; universo: number; leads: number };
  return { meusVotos: Number(r.meus_votos), universo: Number(r.universo), leads: Number(r.leads) };
}

export interface BeneficiarioObra { contactId: string | null; nome: string | null; telefone: string | null; cidade: string | null; bairro: string | null; created_at: string }

/** Beneficiários captados pelo link público da obra (pol_leads.pol_obra_id → contacts). */
export async function listarBeneficiariosObra(obraId: string): Promise<BeneficiarioObra[]> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return [];
  const db = await createClient();
  const { data } = await db
    .from("pol_leads")
    .select("created_at, contact_id, contacts!contact_id(name, phone_number, custom_fields)")
    .eq("organization_id", org.orgId)
    .eq("pol_obra_id", obraId)
    .order("created_at", { ascending: false })
    .limit(500);
  return ((data ?? []) as unknown as { created_at: string; contact_id: string | null; contacts: { name: string | null; phone_number: string | null; custom_fields: Record<string, unknown> | null } | null }[]).map((r) => {
    const cf = (r.contacts?.custom_fields ?? {}) as { endereco_gip?: { cidade?: string; bairro?: string }; cidade?: string; bairro?: string };
    const geo = cf.endereco_gip ?? {};
    return {
      contactId: r.contact_id ?? null,
      nome: r.contacts?.name ?? null,
      telefone: r.contacts?.phone_number ?? null,
      cidade: geo.cidade ?? cf.cidade ?? null,
      bairro: geo.bairro ?? cf.bairro ?? null,
      created_at: r.created_at,
    };
  });
}

/** Beneficiários captados pelo link público da EMENDA (pol_leads.pol_emenda_id). */
export async function listarBeneficiariosEmenda(emendaId: string): Promise<BeneficiarioObra[]> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return [];
  const db = await createClient();
  const { data } = await db
    .from("pol_leads")
    .select("created_at, contact_id, contacts!contact_id(name, phone_number, custom_fields)")
    .eq("organization_id", org.orgId)
    .eq("pol_emenda_id", emendaId)
    .order("created_at", { ascending: false })
    .limit(500);
  return ((data ?? []) as unknown as { created_at: string; contact_id: string | null; contacts: { name: string | null; phone_number: string | null; custom_fields: Record<string, unknown> | null } | null }[]).map((r) => {
    const cf = (r.contacts?.custom_fields ?? {}) as { endereco_gip?: { cidade?: string; bairro?: string }; cidade?: string; bairro?: string };
    const geo = cf.endereco_gip ?? {};
    return { contactId: r.contact_id ?? null, nome: r.contacts?.name ?? null, telefone: r.contacts?.phone_number ?? null, cidade: geo.cidade ?? cf.cidade ?? null, bairro: geo.bairro ?? cf.bairro ?? null, created_at: r.created_at };
  });
}

export async function removerFotoObra(fotoId: string): Promise<AcaoResultado> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();
  const { data: foto } = await db.from("pol_obra_fotos").select("storage_path").eq("id", fotoId).eq("organization_id", org.orgId).maybeSingle();
  const { error } = await db.from("pol_obra_fotos").delete().eq("id", fotoId).eq("organization_id", org.orgId);
  if (error) return { ok: false, erro: traduzErro(error) };
  const path = (foto as { storage_path?: string } | null)?.storage_path;
  if (path) await createAdminClient().storage.from(BUCKET).remove([path]); // remove o binário
  return { ok: true };
}
