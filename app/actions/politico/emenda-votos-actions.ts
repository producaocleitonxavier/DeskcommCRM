"use server";

/**
 * EMENDA × VOTO — a camada de dados do diferencial. Monta os destinos (com
 * valor investido) a partir das emendas e busca os votos do parlamentar ali no
 * TSE (intel_*), pela lente do mandato:
 *
 *  - DEPUTADO: destino = município; votos por município (intel_mapa_municipio_sq,
 *    que também traz o total válido → dá o %).
 *  - VEREADOR/PREFEITO: destino = bairro; votos por bairro (intel_cand_drill).
 *
 * Fail-soft em tudo: sem candidato vinculado (pol_gabinete_config) ou sem dado,
 * devolve `temDados:false` e a tela esconde a coluna. Nunca lança.
 */

import { createClient } from "@/lib/supabase/server";
import {
  cruzarEmendaVoto,
  normalizarChave,
  resumoInvestimentoVsVoto,
  temDadosDeVoto,
  type CruzamentoEmendaVoto,
  type DestinoComValor,
  type ResumoEmendaVoto,
  type VotoNoDestino,
} from "@/lib/politico/emenda-votos";
import { grauDoDestino, type TipoMandato } from "@/lib/politico/emenda-painel";

export interface EmendaVotosResultado {
  itens: CruzamentoEmendaVoto[];
  resumo: ResumoEmendaVoto;
  temDados: boolean;
}

const VAZIO: EmendaVotosResultado = {
  itens: [],
  resumo: { temDados: false, valorOportunidadeCents: 0, valorFortalezaCents: 0, nOportunidade: 0, nFortaleza: 0 },
  temDados: false,
};

interface EmendaDestinoRow {
  municipio: string | null;
  bairro: string | null;
  valor_indicado_cents: number | null;
  status: string | null;
}

/** Soma o valor indicado por destino (ignora pedidos/rascunhos). */
function agruparDestinos(
  rows: EmendaDestinoRow[],
  grau: "municipio" | "bairro",
  // p/ município, a chave é o ibge (resolvido fora); recebemos um mapa nome->ibge.
  nomeParaChave: (nome: string) => string | null,
): DestinoComValor[] {
  const m = new Map<string, DestinoComValor>();
  for (const r of rows) {
    const status = (r.status ?? "").trim();
    if (status === "solicitada" || status === "rascunho") continue;
    const nome = ((grau === "municipio" ? r.municipio : r.bairro) ?? "").trim();
    if (!nome) continue;
    const chave = nomeParaChave(nome);
    if (!chave) continue;
    const cur = m.get(chave);
    const valor = Number(r.valor_indicado_cents ?? 0);
    if (cur) cur.valorIndicadoCents += valor;
    else m.set(chave, { chave, rotulo: nome, valorIndicadoCents: valor });
  }
  return [...m.values()];
}

export async function buscarEmendaVotos(orgId: string, tipo: TipoMandato): Promise<EmendaVotosResultado> {
  try {
    const db = await createClient();
    const grau = grauDoDestino(tipo);

    const { data: cfg } = await db
      .from("pol_gabinete_config")
      .select("tse_election_id, tse_sq_candidato, cidade")
      .eq("organization_id", orgId)
      .maybeSingle();
    const c = cfg as { tse_election_id: number | null; tse_sq_candidato: number | null; cidade: string | null } | null;
    if (!c?.tse_election_id || !c?.tse_sq_candidato) return VAZIO;

    const { data: emData } = await db
      .from("pol_emendas")
      .select("municipio, bairro, valor_indicado_cents, status")
      .eq("organization_id", orgId)
      .limit(2000);
    const emendas = (emData ?? []) as EmendaDestinoRow[];
    if (emendas.length === 0) return VAZIO;

    let destinos: DestinoComValor[] = [];
    let votos: VotoNoDestino[] = [];

    if (grau === "municipio") {
      // Resolve nome do município -> ibge_code (chave de cruzamento com o TSE).
      const nomes = [...new Set(emendas.map((e) => (e.municipio ?? "").trim()).filter(Boolean))];
      const nomeParaIbge = new Map<string, string>();
      if (nomes.length) {
        const { data: muns } = await db.from("intel_municipios").select("ibge_code, nome");
        for (const m of (muns ?? []) as { ibge_code: string; nome: string }[]) {
          nomeParaIbge.set(normalizarChave(m.nome), String(m.ibge_code));
        }
      }
      destinos = agruparDestinos(emendas, "municipio", (nome) => nomeParaIbge.get(normalizarChave(nome)) ?? null);

      const { data: mapa } = await db.rpc("intel_mapa_municipio_sq", {
        p_election: c.tse_election_id,
        p_sq: Number(c.tse_sq_candidato),
      });
      votos = ((mapa ?? []) as { ibge_code: string; cand_votos: number; total_votos: number }[]).map((r) => ({
        chave: String(r.ibge_code),
        votos: Number(r.cand_votos),
        total: Number(r.total_votos),
      }));
    } else {
      // Vereador/prefeito: bairro. Chave = bairro normalizado.
      destinos = agruparDestinos(emendas, "bairro", (nome) => normalizarChave(nome));

      const cidade = (c.cidade ?? "").trim();
      if (cidade) {
        const { data: mun } = await db
          .from("intel_municipios")
          .select("tse_code")
          .ilike("nome", cidade)
          .limit(1)
          .maybeSingle();
        const tseCode = (mun as { tse_code: string } | null)?.tse_code;
        if (tseCode) {
          const { data: drill } = await db.rpc("intel_cand_drill", {
            p_election: c.tse_election_id,
            p_sq: c.tse_sq_candidato,
            p_dim: "bairro",
            p_municipio: Number(tseCode),
          });
          votos = ((drill ?? []) as { rotulo: string | null; votos: number | null }[])
            .filter((r) => (r.rotulo ?? "").trim())
            .map((r) => ({ chave: normalizarChave(r.rotulo as string), votos: Number(r.votos ?? 0) }));
        }
      }
    }

    if (destinos.length === 0) return VAZIO;
    const itens = cruzarEmendaVoto(destinos, votos);
    return { itens, resumo: resumoInvestimentoVsVoto(itens), temDados: temDadosDeVoto(itens) };
  } catch {
    // Diferencial é um BÔNUS — nunca derruba a página de emendas.
    return VAZIO;
  }
}
