/**
 * RADAR DA IMPRENSA — a regra que separa "notícia que CITA o político" de
 * "noticiário da cidade".
 *
 * Por que existe (12/nov): a tela somava tudo no mesmo "índice de sentimento".
 * No primeiro gabinete, 37 de 37 notícias eram policiais/gerais da cidade e
 * NENHUMA citava o vereador — e a tela dizia "+8 de sentimento". Um número sobre
 * a cidade apresentado como se fosse sobre a pessoa é pior do que não ter número.
 *
 * Regra: a notícia "cita você" quando foi achada pela busca do NOME (o `termo`
 * gravado na coleta é um dos nomes monitorados) OU quando o título traz um dos
 * nomes. Tema, cidade e bairro NÃO contam.
 */

/** minúsculas, sem acento, sem "@", espaços colapsados. */
export function normalizarNome(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/@/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function citaONome(
  mencao: { titulo: string | null; termo: string | null },
  termosNome: readonly string[],
): boolean {
  const nomes = termosNome.map(normalizarNome).filter((n) => n.length >= 3);
  if (nomes.length === 0) return false;
  const termo = mencao.termo ? normalizarNome(mencao.termo) : "";
  if (termo && nomes.includes(termo)) return true;
  const titulo = mencao.titulo ? normalizarNome(mencao.titulo) : "";
  // Nome curto demais ("ana") casaria com qualquer título — exige 4+ no título.
  return titulo.length > 0 && nomes.some((n) => n.length >= 4 && titulo.includes(n));
}

/** Linha de teste que ficou no banco (semente antiga) — nunca entra na tela. */
export function ehMencaoDeTeste(mencao: { fonte: string | null; url?: string | null }): boolean {
  return (mencao.fonte ?? "").trim().toLowerCase() === "@test";
}

/**
 * Os nomes monitorados são só @perfil (ex.: "@cleitonxavier")? A imprensa escreve
 * o nome por extenso — com só o @, a busca do nome nunca acha nada. A tela usa
 * isto para orientar a pessoa a acrescentar o nome como sai no jornal.
 */
export function soTemPerfilComoNome(termosNome: readonly string[]): boolean {
  const limpos = termosNome.map((t) => t.trim()).filter(Boolean);
  return limpos.length > 0 && limpos.every((t) => t.startsWith("@") || !/\s/.test(t));
}
