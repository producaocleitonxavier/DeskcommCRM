/**
 * NÍVEIS DE RELACIONAMENTO — fonte única dos rótulos de `pol_leads.support_level`.
 *
 * Decisão do dono do produto (jurídica, 13/nov): a classificação das pessoas do
 * mandato NÃO tem cara eleitoral. São 4 níveis, definidos pelo COMPORTAMENTO da
 * pessoa com o gabinete — não por opinião nem intenção de voto:
 *
 *   novo_cadastro → "Novo contato"   (entrou na base)
 *   simpatizante  → "Em conversa"    (respondeu / conversa com o gabinete)
 *   apoiador      → "Participante"   (participou: evento, pesquisa, material)
 *   militante     → "Multiplicador"  (trouxe outras pessoas)
 *
 * Os VALORES guardados no banco não mudam — só o rótulo que a tela mostra.
 *
 * O 5º valor (`voto_certo`) só existe em instalação de CAMPANHA: fica atrás da
 * chave `organizations.settings.gabinete.modo_campanha`. Com a chave desligada
 * (padrão), ele não aparece em lugar nenhum: quem estiver guardado como
 * `voto_certo` é mostrado como Multiplicador. Não há tela para ligar a chave.
 *
 * Módulo PURO (sem banco, sem React) — pode ser importado em server e client.
 */

export type ValorDoNivel = "novo_cadastro" | "simpatizante" | "apoiador" | "militante" | "voto_certo";

export interface NivelDeRelacionamento {
  /** Valor guardado em `pol_leads.support_level` (não muda). */
  value: ValorDoNivel;
  /** Rótulo no singular, como a tela mostra. */
  label: string;
  /** Rótulo no plural (KPIs, legendas). */
  plural: string;
  /** O comportamento que coloca a pessoa neste nível. */
  criterio: string;
  /** Só existe em instalação de campanha (chave `gabinete.modo_campanha`). */
  soCampanha?: true;
}

export const NIVEIS_DE_RELACIONAMENTO: readonly NivelDeRelacionamento[] = [
  { value: "novo_cadastro", label: "Novo contato", plural: "Novos contatos", criterio: "Entrou na base" },
  { value: "simpatizante", label: "Em conversa", plural: "Em conversa", criterio: "Respondeu ou conversa com o gabinete" },
  { value: "apoiador", label: "Participante", plural: "Participantes", criterio: "Participou: evento, pesquisa ou material" },
  { value: "militante", label: "Multiplicador", plural: "Multiplicadores", criterio: "Trouxe outras pessoas" },
  {
    value: "voto_certo",
    label: "Voto declarado",
    plural: "Votos declarados",
    criterio: "Declarou intenção de voto — só existe em instalação de campanha",
    soCampanha: true,
  },
] as const;

/** Os valores que o mandato usa (sem o de campanha), na ordem. */
export const VALORES_DO_MANDATO = ["novo_cadastro", "simpatizante", "apoiador", "militante"] as const;
export type ValorDoMandato = (typeof VALORES_DO_MANDATO)[number];

/** O teto do mandato: o nível mais alto que existe com a chave de campanha desligada. */
export const NIVEL_TETO_DO_MANDATO: ValorDoMandato = "militante";

/**
 * A chave de campanha está ligada? Lê `settings.gabinete.modo_campanha === true`
 * (settings = `organizations.settings`). Qualquer outra coisa = desligada.
 */
export function modoCampanhaLigado(settings: unknown): boolean {
  if (!settings || typeof settings !== "object") return false;
  const gabinete = (settings as Record<string, unknown>).gabinete;
  if (!gabinete || typeof gabinete !== "object") return false;
  return (gabinete as Record<string, unknown>).modo_campanha === true;
}

/** Os níveis que a tela pode mostrar: 4 no mandato, 5 com a chave de campanha. */
export function niveisVisiveis(modoCampanha: boolean): readonly NivelDeRelacionamento[] {
  return modoCampanha ? NIVEIS_DE_RELACIONAMENTO : NIVEIS_DE_RELACIONAMENTO.filter((n) => !n.soCampanha);
}

/**
 * O valor a EXIBIR: com a chave desligada, `voto_certo` vira `militante`
 * (soma em Multiplicador). Valor desconhecido passa como veio.
 */
export function nivelParaExibir(value: string | null | undefined, modoCampanha = false): string {
  const v = value ?? "";
  if (v === "voto_certo" && !modoCampanha) return NIVEL_TETO_DO_MANDATO;
  return v;
}

/**
 * O rótulo do nível. Com a chave desligada, `voto_certo` é rotulado como
 * "Multiplicador". Valor desconhecido devolve o próprio valor (nunca vazio).
 */
export function rotuloDoNivel(value: string | null | undefined, modoCampanha = false): string {
  const v = nivelParaExibir(value, modoCampanha);
  return NIVEIS_DE_RELACIONAMENTO.find((n) => n.value === v)?.label ?? v;
}

/** O plural do nível (mesma regra de `rotuloDoNivel`). */
export function pluralDoNivel(value: string | null | undefined, modoCampanha = false): string {
  const v = nivelParaExibir(value, modoCampanha);
  return NIVEIS_DE_RELACIONAMENTO.find((n) => n.value === v)?.plural ?? v;
}

/** "Novo contato → Em conversa → Participante → Multiplicador" — para textos de ajuda. */
export function trilhaDosNiveis(modoCampanha = false): string {
  return niveisVisiveis(modoCampanha)
    .map((n) => n.label)
    .join(" → ");
}

/**
 * O valor pode ENTRAR de fora (API, formulário)? `voto_certo` só com a chave de
 * campanha ligada.
 */
export function nivelAceitoNaEntrada(value: string, modoCampanha: boolean): boolean {
  return niveisVisiveis(modoCampanha).some((n) => n.value === value);
}
