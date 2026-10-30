/**
 * Integração com a API ABERTA da Câmara dos Deputados (dados abertos, sem token).
 * Puxa as PROPOSIÇÕES de autoria do deputado (projetos, PECs, requerimentos…)
 * com a situação/tramitação atual. Só para DEPUTADO FEDERAL — a busca por nome é
 * ESTRITA (nome igual), para nunca puxar homônimo de outro parlamentar.
 */
const BASE = "https://dadosabertos.camara.leg.br/api/v2";

export interface DeputadoCamara {
  id: number;
  nome: string;
  uf: string | null;
  partido: string | null;
}

export interface ProposicaoGov {
  idCamara: number;
  numeroLabel: string; // "PL 1234/2024"
  tipo: string; // enum pol_projetos_lei
  ementa: string | null;
  situacao: string | null;
  orgao: string | null;
  status: string; // enum pol_projetos_lei
  url: string;
}

const MAP_TIPO: Record<string, string> = {
  PL: "projeto_de_lei",
  PLP: "projeto_de_lei",
  PEC: "projeto_de_emenda",
  PDC: "projeto_de_decreto",
  PDL: "projeto_de_decreto",
  PRC: "projeto_de_resolucao",
  REQ: "requerimento",
  RCP: "requerimento",
  RIC: "pedido_de_informacao",
  INC: "indicacao",
};

function mapStatus(situacao: string | null): string {
  const s = (situacao ?? "").toLowerCase();
  if (/arquiv/.test(s)) return "arquivado";
  if (/retirad/.test(s)) return "retirado";
  if (/transformad|promulg|sancion|nova norma|norma jur/.test(s)) return "promulgado";
  if (/vetad/.test(s)) return "vetado";
  if (/plenári|plenario|pronta para pauta/.test(s)) return "em_plenario";
  if (/comiss/.test(s)) return "em_comissao";
  if (/aprovad/.test(s)) return "aprovado";
  return "em_tramitacao";
}

function normalizar(s: string): string {
  // tira acento, caixa, pontuação (ex.: "Jr." == "Jr") e espaço extra — para
  // casar o nome digitado com o registrado na Câmara sem risco de homônimo.
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function getJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/** Acha o deputado FEDERAL pelo nome EXATO (normalizado). Null se não houver. */
export async function acharDeputado(nome: string): Promise<DeputadoCamara | null> {
  const alvo = normalizar(nome ?? "");
  if (!alvo) return null;
  // manda o nome LIMPO (sem espaço duplo/sobra) na busca — a API volta vazio
  // se tiver espaços extras.
  const limpo = (nome ?? "").replace(/\s+/g, " ").trim();
  const j = await getJson(`${BASE}/deputados?nome=${encodeURIComponent(limpo)}&ordem=ASC&ordenarPor=nome`);
  const dados = (j?.dados ?? []) as { id: number; nome: string; siglaUf?: string; siglaPartido?: string }[];
  const exato = dados.find((d) => normalizar(d.nome) === alvo);
  if (!exato) return null;
  return { id: exato.id, nome: exato.nome, uf: exato.siglaUf ?? null, partido: exato.siglaPartido ?? null };
}

/** Proposições de autoria do deputado nos anos pedidos (mais recentes primeiro, com teto). */
export async function buscarProposicoes(idDeputado: number, anos: number[], teto = 30): Promise<ProposicaoGov[]> {
  const brutas: { id: number; siglaTipo: string; numero: number; ano: number; ementa: string | null }[] = [];
  for (const ano of anos) {
    for (let pagina = 1; pagina <= 10 && brutas.length < teto * 2; pagina++) {
      const j = await getJson(
        `${BASE}/proposicoes?idDeputadoAutor=${idDeputado}&ano=${ano}&itens=50&pagina=${pagina}&ordem=DESC&ordenarPor=id`,
      );
      const dados = (j?.dados ?? []) as { id: number; siglaTipo: string; numero: number; ano: number; ementa: string | null }[];
      if (dados.length === 0) break;
      brutas.push(...dados);
      if (dados.length < 50) break;
    }
  }
  const recortadas = brutas.slice(0, teto);

  const out: ProposicaoGov[] = [];
  for (const p of recortadas) {
    const det = await getJson(`${BASE}/proposicoes/${p.id}`);
    const st = det?.dados?.statusProposicao ?? {};
    const situacao = (st.descricaoSituacao ?? st.descricaoTramitacao ?? null) as string | null;
    out.push({
      idCamara: p.id,
      numeroLabel: `${p.siglaTipo} ${p.numero}/${p.ano}`,
      tipo: MAP_TIPO[p.siglaTipo] ?? "outro",
      ementa: (p.ementa ?? "").trim() || null,
      situacao,
      orgao: (st.siglaOrgao ?? null) as string | null,
      status: mapStatus(situacao),
      url: `https://www.camara.leg.br/propostas-legislativas/${p.id}`,
    });
  }
  return out;
}
