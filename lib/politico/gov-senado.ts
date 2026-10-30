/**
 * Integração com a API ABERTA do Senado Federal (dados abertos, sem token).
 * Acha o senador em exercício pelo nome (match ESTRITO, sem risco de homônimo) e
 * puxa as matérias de autoria/coautoria com a situação atual, usando o endpoint
 * ESTÁVEL `/processo?codigoParlamentarAutor=` (o antigo `/autorias` será
 * desativado em 2026-02-01). Devolve o MESMO formato da Câmara (ProposicaoGov).
 */
import type { ProposicaoGov } from "./gov-camara";

const BASE = "https://legis.senado.leg.br/dadosabertos";

export interface SenadorInfo {
  codigo: string;
  nome: string;
  uf: string | null;
  partido: string | null;
}

// tipoDocumento (texto do Senado) -> enum pol_projetos_lei.tipo
function mapTipo(tipoDocumento: string | null, identificacao: string): string {
  const t = (tipoDocumento ?? "").toLowerCase();
  const sigla = (identificacao ?? "").trim().toUpperCase().split(/\s|\d/)[0] ?? "";
  if (/emenda à constitui|emenda a constitui/.test(t) || sigla === "PEC") return "projeto_de_emenda";
  if (/decreto legislativo/.test(t) || sigla === "PDL" || sigla === "PDS") return "projeto_de_decreto";
  if (/resolu/.test(t) || sigla === "PRS") return "projeto_de_resolucao";
  if (/requerimento/.test(t) || sigla === "RQS" || sigla === "REQ") return "requerimento";
  if (/indica/.test(t) || sigla === "INS") return "indicacao";
  if (/projeto de lei|projeto de lei complementar/.test(t) || sigla === "PL" || sigla === "PLS" || sigla === "PLP") return "projeto_de_lei";
  return "outro";
}

// situacaoAtual (texto do Senado) -> enum pol_projetos_lei.status
function mapStatus(situacao: string | null, tramitando: string | null): string {
  const s = (situacao ?? "").toLowerCase();
  if (/arquivad/.test(s)) return "arquivado";
  if (/prejudicad/.test(s)) return "arquivado";
  if (/retirad/.test(s)) return "retirado";
  if (/transformad|norma jur|sancionad|promulgad|convertid/.test(s)) return "promulgado";
  if (/vetad/.test(s)) return "vetado";
  if (/plenári|plenario/.test(s)) return "em_plenario";
  if (/comiss/.test(s)) return "em_comissao";
  if (/aprovad/.test(s)) return "aprovado";
  if ((tramitando ?? "").toLowerCase() === "não" || (tramitando ?? "").toLowerCase() === "nao") return "arquivado";
  return "em_tramitacao";
}

function normalizar(s: string): string {
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

/** Acha o senador EM EXERCÍCIO pelo nome EXATO (parlamentar ou completo). Null se não houver. */
export async function acharSenador(nome: string): Promise<SenadorInfo | null> {
  const alvo = normalizar(nome ?? "");
  if (!alvo) return null;
  const j = await getJson(`${BASE}/senador/lista/atual`);
  const lista = j?.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar ?? [];
  const arr = (Array.isArray(lista) ? lista : [lista]) as { IdentificacaoParlamentar?: Record<string, unknown> }[];
  for (const p of arr) {
    const ip = p.IdentificacaoParlamentar ?? {};
    const nomeP = String(ip.NomeParlamentar ?? "");
    const nomeC = String(ip.NomeCompletoParlamentar ?? "");
    if (normalizar(nomeP) === alvo || normalizar(nomeC) === alvo) {
      return {
        codigo: String(ip.CodigoParlamentar ?? ""),
        nome: nomeP || nomeC,
        uf: (ip.UfParlamentar as string) ?? null,
        partido: (ip.SiglaPartidoParlamentar as string) ?? null,
      };
    }
  }
  return null;
}

/** Matérias de autoria do senador nos anos pedidos (mais recentes primeiro, com teto). */
export async function buscarMateriasSenado(codigo: string, anos: number[], teto = 30): Promise<ProposicaoGov[]> {
  const brutas: Record<string, unknown>[] = [];
  for (const ano of anos) {
    const j = await getJson(`${BASE}/processo?codigoParlamentarAutor=${encodeURIComponent(codigo)}&ano=${ano}`);
    if (Array.isArray(j)) brutas.push(...(j as Record<string, unknown>[]));
  }
  // mais recentes primeiro pela data de apresentação
  brutas.sort((a, b) => String(b.dataApresentacao ?? "").localeCompare(String(a.dataApresentacao ?? "")));

  const out: ProposicaoGov[] = [];
  for (const m of brutas.slice(0, teto)) {
    const identificacao = String(m.identificacao ?? "").trim();
    if (!identificacao) continue;
    const situacao = (m.situacaoAtual as string | null) ?? null;
    const ementa = (String(m.ementa ?? "").trim() || null);
    const id = m.id ?? m.codigoMateria;
    out.push({
      idCamara: Number(id ?? 0),
      numeroLabel: identificacao,
      tipo: mapTipo(m.tipoDocumento as string | null, identificacao),
      ementa,
      situacao,
      orgao: null,
      status: mapStatus(situacao, m.tramitando as string | null),
      url: id ? `https://www25.senado.leg.br/web/atividade/materias/-/materia/${m.codigoMateria ?? id}` : (String(m.urlDocumento ?? "")),
    });
  }
  return out;
}
