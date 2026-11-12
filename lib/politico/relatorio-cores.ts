/**
 * Cores do gráfico de composição dos relatórios — PURO (serve cliente e servidor).
 *
 * Situações conhecidas têm cor de SIGNIFICADO fixa (feito = verde, atrasado =
 * vermelho, marcado = azul, em curso = âmbar), para a mesma palavra ter a mesma
 * cor em todo relatório. O que não é situação conhecida recebe a paleta
 * categórica na ordem em que aparece — nunca cor gerada.
 */

/** Mesma paleta do kit de PDF (`CORES_GRAFICO`), repetida aqui para o cliente não importar o renderer. */
export const PALETA_RELATORIO = ["#2F6FB5", "#17A673", "#E08A1E", "#8B5CF6", "#D9486A", "#0E9AA7"] as const;

const VERDE = "#17A673";
const VERMELHO = "#D9486A";
const AZUL = "#2F6FB5";
const AMBAR = "#E08A1E";
const CINZA = "#7A8798";

const POR_SIGNIFICADO: Record<string, string> = {
  // feito
  concluida: VERDE, realizada: VERDE, realizado: VERDE, atendida: VERDE, paga: VERDE, aprovado: VERDE, promulgado: VERDE, sim: VERDE, ativo: VERDE,
  // problema
  atrasada: VERMELHO, paralisada: VERMELHO, vetado: VERMELHO, cancelada: VERMELHO, cancelado: VERMELHO,
  // marcado / no começo
  agendada: AZUL, agendado: AZUL, planejada: AZUL, planejado: AZUL, indicada: AZUL, apresentado: AZUL,
  // em curso
  "em andamento": AMBAR, empenhada: AMBAR, liquidada: AMBAR, "em tramitacao": AMBAR, "em comissao": AMBAR,
  // neutro
  encerrada: CINZA, arquivado: CINZA, rascunho: CINZA, nao: CINZA,
};

function chave(rotulo: string): string {
  return rotulo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export interface FatiaDoRelatorio {
  label: string;
  valor: number;
  cor: string;
}

/**
 * Conta os valores de uma coluna e devolve as fatias coloridas, da maior para a
 * menor. Vazio ("", "—", null) não entra. No máximo 6 fatias: o resto vira "Outros".
 */
export function fatiasPorValor(valores: (string | number | null | undefined)[]): FatiaDoRelatorio[] {
  const conta = new Map<string, number>();
  for (const v of valores) {
    const s = v == null ? "" : String(v).trim();
    if (!s || s === "—") continue;
    conta.set(s, (conta.get(s) ?? 0) + 1);
  }
  const ordenado = [...conta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
  const topo = ordenado.slice(0, 5);
  const resto = ordenado.slice(5);
  if (resto.length === 1) topo.push(resto[0]!);
  const outros = resto.length > 1 ? resto.reduce((s, [, n]) => s + n, 0) : 0;

  let proxima = 0;
  const usadas = new Set<string>();
  const fatias = topo.map(([label, valor]) => {
    let cor = POR_SIGNIFICADO[chave(label)];
    if (!cor || usadas.has(cor)) {
      // paleta categórica, pulando cores já usadas por significado
      do {
        cor = PALETA_RELATORIO[proxima % PALETA_RELATORIO.length]!;
        proxima++;
      } while (usadas.has(cor) && proxima <= PALETA_RELATORIO.length * 2);
    }
    usadas.add(cor);
    return { label, valor, cor };
  });
  if (outros > 0) fatias.push({ label: "Outros", valor: outros, cor: CINZA });
  return fatias;
}
