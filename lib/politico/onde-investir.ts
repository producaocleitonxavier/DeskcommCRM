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

export type Leitura = "oportunidade" | "fortaleza" | "acompanhar";

export interface BairroInvestir {
  /** Nome da unidade: bairro (vereador) ou município (deputado). */
  bairro: string;
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

  // Limiares (terços) dos votos entre as unidades COM voto.
  const votosOrdenados = [...votosPorUnidade.values()].map((v) => v.votos).filter((v) => v > 0).sort((a, b) => a - b);
  const p = (frac: number) => (votosOrdenados.length ? votosOrdenados[Math.floor((votosOrdenados.length - 1) * frac)] ?? 0 : 0);
  const baixo = p(0.34);
  const alto = p(0.66);

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

  const itens: BairroInvestir[] = [];
  for (const [k, d] of demandasPorUnidade) {
    const v = votosPorUnidade.get(k);
    const votos = v?.votos ?? 0;
    let leitura: Leitura = "acompanhar";
    if (votos <= baixo) leitura = "oportunidade";
    else if (votos >= alto) leitura = "fortaleza";
    itens.push({ bairro: v?.nome ?? d.nome, demandas: d.qtd, votos, leitura });
  }

  // Oportunidades primeiro (menos votos no topo), depois mais demandas.
  const ordem: Record<Leitura, number> = { oportunidade: 0, acompanhar: 1, fortaleza: 2 };
  itens.sort((a, b) => ordem[a.leitura] - ordem[b.leitura] || a.votos - b.votos || b.demandas - a.demandas);

  return { temTse: true, cidade, dimensao, itens: itens.slice(0, 10) };
}
