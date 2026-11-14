/**
 * ADENDO DO GABINETE ao prompt do agente de IA (14/nov).
 *
 * Duas regras que valem para TODO gabinete parlamentar e que não podem depender de
 * cada cliente lembrar de escrever no próprio prompt:
 *  1. a IA se apresenta como IA já na primeira mensagem;
 *  2. saúde e criança: a IA acolhe, registra e passa para uma pessoa.
 *
 * Entra no fim da camada do agente, em tempo de execução, quando a organização tem
 * identidade de gabinete (`pol_gabinete_config`). Módulo PURO: só monta texto.
 */

export type IdentidadeDoGabinete = {
  nomeParlamentar?: string | null;
  cargo?: string | null;
};

/** "do vereador" / "da vereadora" / "do deputado estadual" — o cargo em minúsculas, com o artigo. */
export function cargoComArtigo(cargo: string | null | undefined): string | null {
  const c = (cargo ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!c) return null;
  const primeira = c.split(" ")[0] ?? "";
  // Vereadora, deputada, senadora, prefeita, governadora… ("parlamentar" e afins ficam no masculino genérico).
  const feminino = /(?:ora|ada|eita)$/.test(primeira);
  return `${feminino ? "da" : "do"} ${c}`;
}

/** A frase de apresentação: "Sou a IA do gabinete do vereador Fulano." */
export function apresentacaoDaIA(g: IdentidadeDoGabinete): string {
  const nome = (g.nomeParlamentar ?? "").replace(/\s+/g, " ").trim();
  const cargo = cargoComArtigo(g.cargo);
  if (nome && cargo) return `Sou a IA do gabinete ${cargo} ${nome}.`;
  if (nome) return `Sou a IA do gabinete de ${nome}.`;
  return "Sou a IA do gabinete.";
}

/** O texto que entra no fim do prompt do agente. */
export function adendoDoGabinete(g: IdentidadeDoGabinete): string {
  return (
    "\n\n# Regras do gabinete (valem sempre, acima do que estiver escrito antes)\n" +
    `- APRESENTAÇÃO: na PRIMEIRA mensagem que você enviar nesta conversa, comece dizendo exatamente: "${apresentacaoDaIA(g)}" ` +
    "e siga com o atendimento na mesma mensagem. Se você já se apresentou nesta conversa, não repita. " +
    "Nunca diga nem dê a entender que é o próprio parlamentar ou uma pessoa da equipe.\n" +
    "- SAÚDE E CRIANÇAS: quando a pessoa falar de saúde (dela ou de familiar) ou de criança ou adolescente, " +
    "acolha com cuidado, registre a demanda com o essencial e passe a conversa para a equipe (ferramenta de " +
    "passar para uma pessoa). Não peça laudo, diagnóstico, nome de remédio nem dados da criança além do que " +
    "for preciso para encaminhar. Em risco imediato, oriente ligar 192 ou 190 antes de tudo.\n"
  );
}
