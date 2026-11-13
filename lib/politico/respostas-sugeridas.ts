/**
 * RESPOSTAS PRONTAS SUGERIDAS — o conjunto inicial que um gabinete ganha com um
 * clique ("Usar as respostas sugeridas"). São as frases que a atendente repete o
 * dia inteiro; ela escolhe uma na conversa, ajusta se quiser e envia.
 *
 * Regras de escrita (as mesmas dos avisos ao cidadão):
 *  - nunca promete prazo nem resultado, nunca pede voto ou apoio;
 *  - sem link (muita gente acha que link é vírus);
 *  - `{{primeiro_nome}}` é trocado pelo nome da pessoa na hora de inserir;
 *  - o que só o gabinete sabe (endereço, horário) vem entre colchetes, para ser
 *    preenchido UMA vez ao revisar.
 *
 * Puro, para ser testável. Quem grava é `app/actions/politico/respostas-prontas.ts`.
 */

export interface RespostaSugerida {
  titulo: string;
  /** O que a pessoa digita depois de "/" para achar rápido. */
  atalho: string;
  texto: string;
}

export function respostasSugeridas(p: { nomeParlamentar?: string | null; cargo?: string | null }): RespostaSugerida[] {
  const nome = (p.nomeParlamentar ?? "").trim();
  const cargo = (p.cargo ?? "").trim();
  const gabinete = nome ? `gabinete do ${cargo ? `${cargo} ` : ""}${nome}` : "nosso gabinete";

  return [
    {
      titulo: "Boas-vindas",
      atalho: "ola",
      texto: `Olá, {{primeiro_nome}}! Aqui é do ${gabinete}. Obrigado por entrar em contato. Como podemos ajudar?`,
    },
    {
      titulo: "Pedir os dados da demanda",
      atalho: "dados",
      texto:
        "Para registrar o seu pedido, preciso de algumas informações:\n\n" +
        "1. Seu nome completo\n" +
        "2. O endereço do problema (rua, número e bairro)\n" +
        "3. O que está acontecendo\n" +
        "4. Uma foto, se tiver\n\n" +
        "Pode mandar tudo por aqui mesmo.",
    },
    {
      titulo: "Demanda registrada",
      atalho: "registrada",
      texto:
        "{{primeiro_nome}}, o seu pedido foi registrado aqui no gabinete. Vamos encaminhar ao órgão responsável e te avisamos por aqui quando houver novidade.",
    },
    {
      titulo: "Demanda encaminhada ao órgão",
      atalho: "encaminhada",
      texto:
        "{{primeiro_nome}}, passando para avisar que o seu pedido já foi encaminhado ao órgão responsável. Seguimos acompanhando e te retornamos assim que houver resposta.",
    },
    {
      titulo: "Faltou foto ou endereço",
      atalho: "falta",
      texto:
        "{{primeiro_nome}}, para dar andamento ao seu pedido ainda preciso do endereço completo (rua, número e bairro) e, se possível, de uma foto do local. Pode me enviar por aqui?",
    },
    {
      titulo: "Horário e endereço do gabinete",
      atalho: "horario",
      texto:
        "O gabinete atende de [dias e horário de atendimento], em [endereço do gabinete]. Se preferir, pode continuar falando com a gente por aqui.",
    },
    {
      titulo: "Fora do horário",
      atalho: "fora",
      texto:
        "Olá, {{primeiro_nome}}! Recebemos a sua mensagem fora do horário de atendimento. Assim que a equipe voltar, alguém te responde por aqui.",
    },
    {
      titulo: "Assunto de outro órgão",
      atalho: "outro",
      texto:
        "{{primeiro_nome}}, esse assunto é atendido diretamente por outro órgão. Os canais são:\n\n" +
        "Prefeitura: 156\n" +
        "Falta de luz (CEMIG): 116\n" +
        "Água e esgoto (COPASA): 115\n" +
        "Emergência de saúde (SAMU): 192\n\n" +
        "Se não conseguir atendimento por lá, me avise por aqui que o gabinete registra o seu pedido.",
    },
    {
      titulo: "Agradecimento",
      atalho: "obrigado",
      texto: "Nós que agradecemos o contato, {{primeiro_nome}}. Sempre que precisar, é só escrever por aqui.",
    },
  ];
}
