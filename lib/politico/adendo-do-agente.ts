/**
 * REGRAS DO GABINETE para o agente de IA (14/nov).
 *
 * Duas regras que valem para TODO gabinete parlamentar e que não podem depender de
 * cada cliente lembrar de escrever no próprio prompt:
 *
 *  1. A IA se apresenta como IA na primeira mensagem a um contato novo. Isso NÃO é
 *     pedido ao modelo: é a frase `apresentacaoDaIA`, que o portão de apresentação do
 *     motor (`disclosureGate`) coloca na frente da primeira mensagem, de forma
 *     determinística, quando o gabinete não publicou um texto próprio.
 *  2. Saúde e criança: a IA atende e chama a equipe. Isso é `adendoDoGabinete`, um
 *     trecho fixo somado ao prompt do cliente.
 *
 * Módulo PURO: só monta texto. O adendo NÃO leva nome nem cargo — são colunas que um
 * membro da organização grava, e texto de membro não entra no prompt de sistema.
 */

export type IdentidadeDoGabinete = {
  nomeParlamentar?: string | null;
  cargo?: string | null;
};

/** Só letras, espaço, ponto, hífen e apóstrofo; sem quebra de linha; com teto. */
function limpar(valor: string | null | undefined, teto: number): string {
  return (valor ?? "")
    .normalize("NFC")
    .replace(/[^\p{L}\s.'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, teto)
    .trim();
}

/** "do vereador" / "da vereadora" / "do deputado estadual" — o cargo em minúsculas, com o artigo. */
export function cargoComArtigo(cargo: string | null | undefined): string | null {
  const c = limpar(cargo, 60).toLowerCase();
  if (!c) return null;
  const primeira = c.split(" ")[0] ?? "";
  // Vereadora, deputada, senadora, prefeita, governadora, presidenta…
  const feminino = /(?:ora|ada|eita|enta)$/.test(primeira);
  return `${feminino ? "da" : "do"} ${c}`;
}

/** A frase de apresentação: "Sou a IA do gabinete do vereador Fulano." */
export function apresentacaoDaIA(g: IdentidadeDoGabinete): string {
  const cargoLimpo = limpar(g.cargo, 60);
  let nome = limpar(g.nomeParlamentar, 80);
  // "Vereador Cleiton Xavier" no campo do nome: não repete o cargo.
  if (cargoLimpo && nome.toLowerCase().startsWith(cargoLimpo.toLowerCase() + " ")) {
    nome = nome.slice(cargoLimpo.length).trim();
  }
  const cargo = cargoComArtigo(cargoLimpo);
  if (nome && cargo) return `Sou a IA do gabinete ${cargo} ${nome}.`;
  if (nome) return `Sou a IA do gabinete de ${nome}.`;
  return "Sou a IA do gabinete.";
}

/** O texto fixo que entra no fim do prompt do agente de um gabinete. */
export function adendoDoGabinete(): string {
  return (
    "\n\n# Regras do gabinete\n" +
    "- QUEM VOCÊ É: você é a IA do gabinete. Nunca diga nem dê a entender que é o próprio parlamentar " +
    "ou uma pessoa da equipe. Se perguntarem, diga que é a IA do gabinete e que a equipe acompanha os atendimentos.\n" +
    "- SAÚDE E CRIANÇAS: quando a pessoa falar de saúde (dela ou de familiar) ou de criança ou adolescente, " +
    "atenda normalmente — acolha, oriente e registre a demanda como você já faz — e, em seguida, chame a equipe: " +
    "use a ferramenta de passar para uma pessoa, se ela estiver disponível; se não estiver, diga que a equipe " +
    "do gabinete vai acompanhar o caso. Não peça laudo, diagnóstico, nome de remédio nem dados da criança além " +
    "do que for preciso para encaminhar. Em risco imediato, oriente ligar 192 ou 190 antes de tudo.\n"
  );
}
