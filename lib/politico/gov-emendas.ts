/**
 * Integração com o Portal da Transparência — EMENDAS parlamentares.
 * Puxa as emendas de um parlamentar (por nome) com a execução financeira real
 * (empenhado/liquidado/pago) direto do governo federal. Serve para DEPUTADOS
 * (federal); vereador municipal não tem emenda federal (retorna vazio, ok).
 *
 * Token: env `PORTAL_TRANSPARENCIA_TOKEN` (header `chave-api-dados`). Nunca
 * logar o token.
 */
const BASE = "https://api.portaldatransparencia.gov.br/api-de-dados/emendas";

export interface EmendaGov {
  codigoEmenda: string;
  ano: number;
  numero: string; // número oficial como veio (coluna pol_emendas.numero é TEXT)
  tipo: string | null;
  autor: string | null;
  localidade: string | null;
  funcao: string | null;
  subfuncao: string | null;
  empenhadoCents: number;
  liquidadoCents: number;
  pagoCents: number;
}

/** "10.000,00" -> 1000000 (centavos). Tolerante a vazio/formato. */
export function moedaBrParaCents(s: string | null | undefined): number {
  const t = (s ?? "").trim();
  if (!t) return 0;
  const n = parseFloat(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

interface EmendaApi {
  codigoEmenda?: string;
  ano?: number;
  numeroEmenda?: string;
  tipoEmenda?: string;
  nomeAutor?: string;
  autor?: string;
  localidadeDoGasto?: string;
  funcao?: string;
  subfuncao?: string;
  valorEmpenhado?: string;
  valorLiquidado?: string;
  valorPago?: string;
}

function tokenDoAmbiente(): string | null {
  const t = (process.env.PORTAL_TRANSPARENCIA_TOKEN ?? "").trim();
  return t || null;
}

/** Busca as emendas de um parlamentar nos anos pedidos. Paginada, com teto. */
export async function buscarEmendasGov(nomeAutor: string, anos: number[]): Promise<EmendaGov[]> {
  const token = tokenDoAmbiente();
  const nome = (nomeAutor ?? "").trim();
  if (!token || !nome) return [];

  const out: EmendaGov[] = [];
  for (const ano of anos) {
    for (let pagina = 1; pagina <= 20; pagina++) {
      const url = `${BASE}?ano=${ano}&nomeAutor=${encodeURIComponent(nome)}&pagina=${pagina}`;
      let resp: Response;
      try {
        resp = await fetch(url, { headers: { "chave-api-dados": token, accept: "application/json" } });
      } catch {
        break; // rede falhou: encerra este ano sem derrubar o resto
      }
      if (!resp.ok) break;
      let linhas: EmendaApi[];
      try {
        linhas = (await resp.json()) as EmendaApi[];
      } catch {
        break;
      }
      if (!Array.isArray(linhas) || linhas.length === 0) break;
      for (const e of linhas) {
        const numero = (e.numeroEmenda ?? "").trim();
        out.push({
          codigoEmenda: (e.codigoEmenda ?? "").trim(),
          ano: e.ano ?? ano,
          numero,
          tipo: (e.tipoEmenda ?? "").trim() || null,
          autor: (e.nomeAutor ?? e.autor ?? "").trim() || null,
          localidade: (e.localidadeDoGasto ?? "").trim() || null,
          funcao: (e.funcao ?? "").trim() || null,
          subfuncao: (e.subfuncao ?? "").trim() || null,
          empenhadoCents: moedaBrParaCents(e.valorEmpenhado),
          liquidadoCents: moedaBrParaCents(e.valorLiquidado),
          pagoCents: moedaBrParaCents(e.valorPago),
        });
      }
      if (linhas.length < 15) break; // última página
    }
  }
  return out;
}
