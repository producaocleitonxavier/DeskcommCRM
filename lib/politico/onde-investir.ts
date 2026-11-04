/**
 * INTELIGÊNCIA PREDITIVA — "Onde investir" (Fase D #12). Cruza onde o cidadão
 * MAIS PEDE ajuda (demandas) com onde o parlamentar TEM VOTO (TSE, intel_*).
 * Aponta: unidade que pede e quase não vota = OPORTUNIDADE; muito voto =
 * FORTALEZA. À prova de criança: uma leitura por unidade, sem jargão.
 *
 * MANDATE-AWARE: vereador/prefeito cruza por BAIRRO (dentro da cidade); deputado
 * estadual/federal cruza por MUNICÍPIO (espalha pelo estado — ex.: Poços de
 * Caldas, Contagem), usando os votos reais por município do TSE.
 */
import { createClient } from "@/lib/supabase/server";
import { lerMandatoConfig } from "@/lib/politico/setup-do-mandato";

export type Leitura = "oportunidade" | "fortaleza" | "fraco" | "acompanhar";

export interface BairroInvestir {
  /** Nome da unidade (para exibir): bairro (vereador) ou município (deputado). */
  bairro: string;
  /** Valor CRU da demanda (pol_municipio/pol_bairro) — usado para filtrar a lista
   *  de demandas ao clicar. Pode diferir do nome exibido (que pode vir do TSE). */
  valor: string;
  demandas: number;
  votos: number;
  leitura: Leitura;
}

export interface OndeInvestir {
  temTse: boolean; // o parlamentar está vinculado ao candidato no TSE?
  cidade: string | null;
  /** Unidade do cruzamento, para a tela ajustar o texto. */
  dimensao: "bairro" | "municipio";
  itens: BairroInvestir[];
}

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export async function buscarOndeInvestir(orgId: string): Promise<OndeInvestir> {
  const db = await createClient();

  // Tipo de mandato → unidade do cruzamento.
  const { data: orgRow } = await db.from("organizations").select("settings").eq("id", orgId).maybeSingle();
  const tipo = lerMandatoConfig((orgRow as { settings?: unknown } | null)?.settings)?.tipo ?? "vereador";
  const ehDeputado = tipo === "dep_estadual" || tipo === "dep_federal";
  const dimensao: "bairro" | "municipio" = ehDeputado ? "municipio" : "bairro";

  const { data: cfg } = await db
    .from("pol_gabinete_config")
    .select("tse_election_id, tse_sq_candidato, cidade")
    .eq("organization_id", orgId)
    .maybeSingle();
  const c = cfg as { tse_election_id: number | null; tse_sq_candidato: number | null; cidade: string | null } | null;
  const cidade = (c?.cidade ?? "").trim() || null;

  if (!c?.tse_election_id || !c?.tse_sq_candidato) {
    return { temTse: false, cidade, dimensao, itens: [] };
  }
  // Vereador/prefeito precisa da cidade (cruza bairro dentro dela); deputado não.
  if (!ehDeputado && !cidade) {
    return { temTse: true, cidade, dimensao, itens: [] };
  }

  // ── Votos do parlamentar por UNIDADE (bairro ou município) ──────────────
  const votosPorUnidade = new Map<string, { nome: string; votos: number }>();
  if (ehDeputado) {
    // Votos por MUNICÍPIO (estado inteiro) — p_municipio null = sem recorte.
    const { data: drill } = await db.rpc("intel_cand_drill", {
      p_election: c.tse_election_id,
      p_sq: c.tse_sq_candidato,
      p_dim: "municipio",
      p_municipio: null,
    });
    for (const r of (drill ?? []) as { rotulo: string | null; votos: number | null }[]) {
      const nome = (r.rotulo ?? "").trim();
      if (nome) votosPorUnidade.set(normalizar(nome), { nome, votos: r.votos ?? 0 });
    }
  } else {
    const { data: mun } = await db
      .from("intel_municipios")
      .select("tse_code, nome")
      .ilike("nome", cidade!)
      .limit(1)
      .maybeSingle();
    const tseCode = (mun as { tse_code: string } | null)?.tse_code;
    if (!tseCode) return { temTse: true, cidade, dimensao, itens: [] };
    const { data: drill } = await db.rpc("intel_cand_drill", {
      p_election: c.tse_election_id,
      p_sq: c.tse_sq_candidato,
      p_dim: "bairro",
      p_municipio: Number(tseCode),
    });
    for (const r of (drill ?? []) as { rotulo: string | null; votos: number | null }[]) {
      const nome = (r.rotulo ?? "").trim();
      if (nome) votosPorUnidade.set(normalizar(nome), { nome, votos: r.votos ?? 0 });
    }
  }

  // ── Demandas por UNIDADE (do gabinete) ─────────────────────────────────
  const coluna = ehDeputado ? "pol_municipio" : "pol_bairro";
  const { data: dem } = await db
    .from("demandas")
    .select(coluna)
    .eq("organization_id", orgId)
    .eq("pol_gabinete", true)
    .not(coluna, "is", null)
    .limit(3000);
  const demandasPorUnidade = new Map<string, { nome: string; qtd: number }>();
  for (const r of (dem ?? []) as Record<string, string | null>[]) {
    const nome = (r[coluna] ?? "").trim();
    if (!nome) continue;
    const k = normalizar(nome);
    const cur = demandasPorUnidade.get(k);
    demandasPorUnidade.set(k, { nome: cur?.nome ?? nome, qtd: (cur?.qtd ?? 0) + 1 });
  }

  // Leitura REAL (fortaleza / oportunidade / ponto fraco). Os limiares saem das
  // unidades QUE APARECEM (as que têm demanda) — NÃO do estado/cidade inteiros;
  // senão todo lugar onde o gabinete já trabalha (que costumam ser os redutos
  // dele) vira "fortaleza" e a tela mente. Cruzamos voto × demanda:
  //  • muito voto (terço de cima) = FORTALEZA (sua base — proteja e retribua);
  //  • pouco voto mas o cidadão PEDE bastante = OPORTUNIDADE (espaço pra crescer);
  //  • pouco voto E pouca relação = PONTO FRACO (presença fraca, vale avaliar).
  const base = [...demandasPorUnidade].map(([k, d]) => {
    const v = votosPorUnidade.get(k);
    return { nome: v?.nome ?? d.nome, valor: d.nome, demandas: d.qtd, votos: v?.votos ?? 0 };
  });
  const votosOrd = base.map((b) => b.votos).filter((v) => v > 0).sort((a, b) => a - b);
  const nv = votosOrd.length;
  // Limiar da fortaleza = terço de cima dos votos entre as unidades mostradas.
  const alto = nv ? votosOrd[Math.min(nv - 1, Math.ceil((nv * 2) / 3))] ?? 0 : 0;
  // Demanda "relevante" = igual ou acima da mediana das unidades mostradas.
  const demOrd = base.map((b) => b.demandas).sort((a, b) => a - b);
  const medianaDem = demOrd.length ? demOrd[Math.floor((demOrd.length - 1) / 2)] ?? 1 : 1;

  const itens: BairroInvestir[] = base.map((b) => {
    let leitura: Leitura;
    if (b.votos > 0 && b.votos >= alto) leitura = "fortaleza";
    else if (b.demandas >= medianaDem) leitura = "oportunidade";
    else leitura = "fraco";
    return { bairro: b.nome, valor: b.valor, demandas: b.demandas, votos: b.votos, leitura };
  });

  // Oportunidades no topo (onde investir), depois os pontos fracos, por fim as fortalezas.
  const ordem: Record<Leitura, number> = { oportunidade: 0, fraco: 1, fortaleza: 2, acompanhar: 3 };
  itens.sort((a, b) => ordem[a.leitura] - ordem[b.leitura] || a.votos - b.votos || b.demandas - a.demandas);

  return { temTse: true, cidade, dimensao, itens: itens.slice(0, 10) };
}
