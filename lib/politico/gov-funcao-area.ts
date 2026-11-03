/**
 * Mapa FUNÇÃO ORÇAMENTÁRIA (gov) → área temática do GIP.
 *
 * No caminho FEDERAL (sync do Portal da Transparência) a `funcao` já vem
 * classificada OFICIALMENTE pelo governo (Saúde=10, Educação=12, Segurança
 * Pública=06, Urbanismo=15, etc. — as funções orçamentárias). Então não
 * precisamos adivinhar: traduzimos a função do gov pro nosso enum fixo
 * (CHECK de pol_emendas.area_tematica).
 *
 * Isto NÃO afeta o caminho manual (vereador/estadual), que classifica por
 * texto livre em outro lugar — aqui é só pra importação federal.
 */

export type AreaTematica =
  | "saude"
  | "educacao"
  | "seguranca"
  | "assistencia_social"
  | "infraestrutura"
  | "cultura"
  | "esporte"
  | "meio_ambiente"
  | "agricultura"
  | "tecnologia"
  | "outro";

/** minúsculo, sem acento, espaços colapsados. */
function normaliza(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Traduz a função orçamentária do gov pro enum de área. Cobre as 28 funções
 * oficiais; o que não mapeia num tema nosso cai em "outro" (Legislativa,
 * Judiciária, Administração, Defesa, Previdência, Trabalho, Encargos...).
 */
export function funcaoParaArea(funcao: string | null | undefined): AreaTematica {
  const f = normaliza(funcao ?? "");
  if (!f) return "outro";

  // Assistência social antes de qualquer coisa genérica.
  if (f.includes("assistencia social")) return "assistencia_social";
  if (f.includes("saude")) return "saude";
  if (f.includes("educacao")) return "educacao";
  if (f.includes("seguranca")) return "seguranca"; // "Segurança Pública"
  // Agricultura ANTES de cultura — "agriCULTURA" contém "cultura".
  if (f.includes("agricultura") || f.includes("agraria") || f.includes("agrario")) return "agricultura";
  if (f.includes("cultura")) return "cultura";
  if (f.includes("desporto") || f.includes("esporte") || f.includes("lazer")) return "esporte";
  if (f.includes("ambiental") || f.includes("meio ambiente")) return "meio_ambiente";
  if (f.includes("tecnologia")) return "tecnologia"; // "Ciência e Tecnologia"
  // Infraestrutura guarda-chuva (urbanismo, habitação, saneamento, transporte,
  // energia, comunicações) — o deputado trata tudo isso como "obra/infra".
  if (
    f.includes("urbanismo") ||
    f.includes("infraestrutura") ||
    f.includes("infra-estrutura") ||
    f.includes("transporte") ||
    f.includes("saneamento") ||
    f.includes("habitacao") ||
    f.includes("energia") ||
    f.includes("comunicac")
  ) {
    return "infraestrutura";
  }
  return "outro";
}
