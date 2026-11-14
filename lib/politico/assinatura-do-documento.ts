/**
 * O TEXTO do bloco de assinatura dos documentos do gabinete (ofício, requerimento…):
 * a linha de cima (quem assina) e a de baixo (cargo, partido, o que o gabinete usar).
 *
 * O bloco é desenhado pelo sistema logo DEPOIS do texto — nunca deve vir impresso na
 * imagem do papel timbrado: lá ele fica num lugar fixo, o texto passa por cima e ele
 * se repete em toda página.
 *
 * Guardado em `organizations.settings.gabinete.assinatura_do_documento`. Sem nada
 * guardado, vale o nome e o cargo da Identidade do Mandato.
 */

export type LinhasDaAssinatura = { linha1: string; linha2: string };

export const TAMANHO_MAXIMO_DA_LINHA_DE_ASSINATURA = 80;

/** Uma linha digitada: sem quebra, sem excesso de espaço, com teto. */
export function limparLinhaDeAssinatura(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, TAMANHO_MAXIMO_DA_LINHA_DE_ASSINATURA) : "";
}

/** O que o gabinete guardou (vazio quando nunca escolheu). */
export function linhasGuardadasDaAssinatura(settings: unknown): LinhasDaAssinatura {
  const vazio = { linha1: "", linha2: "" };
  if (!settings || typeof settings !== "object") return vazio;
  const gabinete = (settings as Record<string, unknown>).gabinete;
  if (!gabinete || typeof gabinete !== "object") return vazio;
  const a = (gabinete as Record<string, unknown>).assinatura_do_documento;
  if (!a || typeof a !== "object") return vazio;
  const o = a as Record<string, unknown>;
  return { linha1: limparLinhaDeAssinatura(o.linha1), linha2: limparLinhaDeAssinatura(o.linha2) };
}

/**
 * As duas linhas que vão no documento. A de cima nunca fica vazia (cai no nome do
 * parlamentar); a de baixo cai no cargo só quando o gabinete não escolheu NADA —
 * quem preencheu só a de cima quer uma linha só.
 */
export function linhasDaAssinatura(settings: unknown, nome: string | null, cargo: string | null): LinhasDaAssinatura {
  const g = linhasGuardadasDaAssinatura(settings);
  const escolheu = g.linha1 !== "" || g.linha2 !== "";
  return {
    linha1: g.linha1 || limparLinhaDeAssinatura(nome),
    linha2: escolheu ? g.linha2 : limparLinhaDeAssinatura(cargo),
  };
}
