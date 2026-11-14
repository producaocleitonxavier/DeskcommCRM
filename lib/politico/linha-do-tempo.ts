/**
 * LINHA DO TEMPO DO CIDADÃO 360° — junta, num feed cronológico, tudo o que
 * aquele cidadão viveu com o gabinete: como chegou (origem), as demandas, os
 * ofícios, os avisos que recebeu e as mudanças de nível de relacionamento. O gabinete sabe TUDO
 * antes de atender. Isolado (self-contained): a página só chama e renderiza.
 */
import { rotuloDoNivel } from "@/lib/politico/niveis";
import { createClient } from "@/lib/supabase/server";

export type TipoEvento = "origem" | "demanda" | "resolvida" | "encaminhada" | "oficio" | "aviso" | "funil" | "nota";

export interface EventoLinha {
  id: string;
  tipo: TipoEvento;
  data: string; // ISO
  titulo: string;
  detalhe?: string | null;
}

/** Rótulo do nível — fonte única em lib/politico/niveis.ts ("voto certo" antigo = Multiplicador). */
function rotuloNaLinha(nivel: string): string {
  if (nivel === "nao_eleitor") return "Não eleitor"; // valor legado, fora dos níveis
  return rotuloDoNivel(nivel, false);
}

const SOURCE_LABEL: Record<string, string> = {
  Indicação: "indicação",
  indicacao: "indicação",
  instagram: "Instagram",
  qr: "QR Code",
  abaixo_assinado: "abaixo-assinado",
};

export async function buscarLinhaDoTempo(orgId: string, contactId: string): Promise<EventoLinha[]> {
  const db = await createClient();
  const eventos: EventoLinha[] = [];

  // Origem (como entrou na base)
  const { data: c } = await db
    .from("contacts")
    .select("created_at, source")
    .eq("id", contactId)
    .eq("organization_id", orgId)
    .maybeSingle();
  const contato = c as { created_at: string | null; source: string | null } | null;
  if (contato?.created_at) {
    const src = (contato.source ?? "").trim();
    eventos.push({
      id: "origem",
      tipo: "origem",
      data: contato.created_at,
      titulo: "Entrou no relacionamento do gabinete",
      detalhe: src ? `Origem: ${SOURCE_LABEL[src] ?? src}` : null,
    });
  }

  // Demandas do cidadão
  const { data: dem } = await db
    .from("demandas")
    .select("id, assunto, estado, aberta_em, fechada_em")
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .order("aberta_em", { ascending: false })
    .limit(50);
  const demandas = (dem ?? []) as { id: string; assunto: string | null; estado: string; aberta_em: string; fechada_em: string | null }[];
  for (const d of demandas) {
    const assunto = (d.assunto ?? "pedido").trim() || "pedido";
    eventos.push({ id: `dem-${d.id}`, tipo: "demanda", data: d.aberta_em, titulo: `Demanda registrada`, detalhe: assunto });
    if (d.fechada_em && d.estado === "resolvida") {
      eventos.push({ id: `res-${d.id}`, tipo: "resolvida", data: d.fechada_em, titulo: "Demanda atendida", detalhe: assunto });
    }
  }

  // Eventos das demandas (ofício, aviso, encaminhamento)
  const ids = demandas.map((d) => d.id);
  if (ids.length > 0) {
    const { data: evs } = await db
      .from("pol_demanda_eventos")
      .select("id, tipo, descricao, created_at")
      .eq("organization_id", orgId)
      .in("demanda_id", ids)
      .order("created_at", { ascending: false })
      .limit(100);
    for (const e of (evs ?? []) as { id: string; tipo: string; descricao: string | null; created_at: string }[]) {
      if (e.tipo === "oficio_emitido")
        eventos.push({ id: `ev-${e.id}`, tipo: "oficio", data: e.created_at, titulo: "Ofício emitido", detalhe: e.descricao });
      else if (e.tipo === "cidadao_avisado")
        eventos.push({ id: `ev-${e.id}`, tipo: "aviso", data: e.created_at, titulo: "Cidadão avisado", detalhe: e.descricao });
      else if (e.tipo === "encaminhamento_ia")
        eventos.push({ id: `ev-${e.id}`, tipo: "encaminhada", data: e.created_at, titulo: "Encaminhada ao órgão", detalhe: e.descricao });
    }
  }

  // Mudanças de nível de relacionamento
  const { data: tr } = await db
    .from("pol_funnel_transitions")
    .select("id, from_level, to_level, changed_at, reason")
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .order("changed_at", { ascending: false })
    .limit(50);
  for (const t of (tr ?? []) as { id: string; from_level: string | null; to_level: string; changed_at: string; reason: string | null }[]) {
    eventos.push({
      id: `fun-${t.id}`,
      tipo: "funil",
      data: t.changed_at,
      titulo: `Avançou para ${rotuloNaLinha(t.to_level)}`,
      detalhe: t.reason,
    });
  }

  eventos.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  return eventos.slice(0, 40);
}
