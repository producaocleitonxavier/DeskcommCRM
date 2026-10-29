/**
 * INTELIGÊNCIA PREDITIVA — "Onde investir" (Fase D #12). Cruza, por bairro da
 * cidade do parlamentar, as DEMANDAS (onde o cidadão pede ajuda) com os VOTOS
 * dele ali (TSE, intel_*). Aponta: bairro que pede e quase não vota =
 * OPORTUNIDADE; bairro de muito voto = FORTALEZA. À prova de criança: uma
 * leitura por bairro, sem jargão.
 */
import { createClient } from "@/lib/supabase/server";

export type Leitura = "oportunidade" | "fortaleza" | "acompanhar";

export interface BairroInvestir {
  bairro: string;
  demandas: number;
  votos: number;
  leitura: Leitura;
}

export interface OndeInvestir {
  temTse: boolean; // o parlamentar está vinculado ao candidato no TSE?
  cidade: string | null;
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

  const { data: cfg } = await db
    .from("pol_gabinete_config")
    .select("tse_election_id, tse_sq_candidato, cidade")
    .eq("organization_id", orgId)
    .maybeSingle();
  const c = cfg as { tse_election_id: number | null; tse_sq_candidato: number | null; cidade: string | null } | null;
  const cidade = (c?.cidade ?? "").trim() || null;

  if (!c?.tse_election_id || !c?.tse_sq_candidato || !cidade) {
    return { temTse: false, cidade, itens: [] };
  }

  // Município (tse_code) a partir do nome da cidade.
  const { data: mun } = await db
    .from("intel_municipios")
    .select("tse_code, nome")
    .ilike("nome", cidade)
    .limit(1)
    .maybeSingle();
  const tseCode = (mun as { tse_code: string } | null)?.tse_code;
  if (!tseCode) return { temTse: true, cidade, itens: [] };

  // Votos do parlamentar por bairro.
  const { data: drill } = await db.rpc("intel_cand_drill", {
    p_election: c.tse_election_id,
    p_sq: c.tse_sq_candidato,
    p_dim: "bairro",
    p_municipio: Number(tseCode),
  });
  const votosPorBairro = new Map<string, { nome: string; votos: number }>();
  for (const r of (drill ?? []) as { rotulo: string | null; votos: number | null }[]) {
    const nome = (r.rotulo ?? "").trim();
    if (nome) votosPorBairro.set(normalizar(nome), { nome, votos: r.votos ?? 0 });
  }

  // Limiares (terços) dos votos entre os bairros COM voto.
  const votosOrdenados = [...votosPorBairro.values()].map((v) => v.votos).filter((v) => v > 0).sort((a, b) => a - b);
  const p = (frac: number) => (votosOrdenados.length ? votosOrdenados[Math.floor((votosOrdenados.length - 1) * frac)] ?? 0 : 0);
  const baixo = p(0.34);
  const alto = p(0.66);

  // Demandas por bairro (do gabinete).
  const { data: dem } = await db
    .from("demandas")
    .select("pol_bairro")
    .eq("organization_id", orgId)
    .eq("pol_gabinete", true)
    .not("pol_bairro", "is", null)
    .limit(3000);
  const demandasPorBairro = new Map<string, { nome: string; qtd: number }>();
  for (const r of (dem ?? []) as { pol_bairro: string | null }[]) {
    const nome = (r.pol_bairro ?? "").trim();
    if (!nome) continue;
    const k = normalizar(nome);
    const cur = demandasPorBairro.get(k);
    demandasPorBairro.set(k, { nome: cur?.nome ?? nome, qtd: (cur?.qtd ?? 0) + 1 });
  }

  const itens: BairroInvestir[] = [];
  for (const [k, d] of demandasPorBairro) {
    const v = votosPorBairro.get(k);
    const votos = v?.votos ?? 0;
    let leitura: Leitura = "acompanhar";
    if (votos <= baixo) leitura = "oportunidade";
    else if (votos >= alto) leitura = "fortaleza";
    itens.push({ bairro: v?.nome ?? d.nome, demandas: d.qtd, votos, leitura });
  }

  // Oportunidades primeiro (menos votos no topo), depois mais demandas.
  const ordem: Record<Leitura, number> = { oportunidade: 0, acompanhar: 1, fortaleza: 2 };
  itens.sort((a, b) => ordem[a.leitura] - ordem[b.leitura] || a.votos - b.votos || b.demandas - a.demandas);

  return { temTse: true, cidade, itens: itens.slice(0, 10) };
}
