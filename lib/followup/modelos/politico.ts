/**
 * OS TRÊS FOLLOW-UPS DE UM GABINETE — boas-vindas, pós-atendimento e reconexão.
 *
 * O motor de follow-up é o mesmo da clínica (`escada.ts`); o que muda é a VOZ e
 * o RELÓGIO. Um gabinete não "vende" nem "marca consulta": ele constrói
 * relacionamento com o cidadão entre uma eleição e outra. Os três momentos em
 * que esse vínculo se perde no silêncio são: quem acabou de chegar e ninguém
 * acolheu, quem foi atendido e nunca mais ouviu falar do gabinete, e quem
 * esfriou depois de um tempo. Cada um tem um relógio próprio — por isso são três
 * modelos, não um com prazos configuráveis.
 *
 * ⚠️ QUATRO REGRAS QUE OS TEXTOS OBEDECEM, E QUE NÃO SÃO ESTILO:
 *
 * 1. **Nenhum texto afirma preferência política.** "o canal com o gabinete",
 *    nunca "você que apoia o vereador". Opinião política é dado pessoal SENSÍVEL
 *    (LGPD art. 11), e a mensagem aparece na tela de bloqueio do celular, às
 *    vezes lida por outra pessoa. O modo `text` do nó de ação não interpola nada
 *    — nenhum campo da ficha vaza para dentro da mensagem —, e `modelos.test.ts`
 *    reprova texto com `{{`.
 * 2. **Nenhum texto nomeia o candidato nem o gabinete.** Uma imagem serve todos
 *    os mandatos (doutrina de marca própria); o nome do remetente já vai no canal.
 * 3. **Nenhum texto promete.** "encaminho o que você precisar", nunca "resolvo
 *    até sexta": a mensagem é escrita hoje e enviada daqui a dias, e promessa de
 *    autoridade pública que não se cumpre é dano político — e, em campanha,
 *    risco eleitoral.
 * 4. **`cancel_on_reply: true` nos três.** Respondeu qualquer coisa, a inscrição
 *    é CANCELADA (`outcome='replied'`) e a conversa volta para quem atende —
 *    agente ou assessor. O follow-up só existe para o silêncio; quem constrói a
 *    relação de verdade é o atendimento, não o robô falando por cima da pessoa.
 */
import type { ModeloDeFollowup } from "./tipos";
import { montarEscada } from "./escada";

const DIA_MS = 86_400_000;

/** Quem responde um follow-up está falando com o gabinete, não com o fluxo. */
const O_ATENDIMENTO_ASSUME = "A pessoa respondeu — quem segue a conversa é o atendimento do gabinete.";

export const MODELOS_DE_POLITICO: readonly ModeloDeFollowup[] = [
  {
    id: "politico-boas-vindas",
    nicho: "politico",
    nome: "Boas-vindas · acolher quem acabou de chegar",
    jornada: "Boas-vindas",
    resumo:
      "Alguém novo entrou em contato com o mandato. O fluxo apresenta o canal e começa a relação, sem pedir nada em troca.",
    oQueDispara: "Um novo contato entrar no sistema.",
    pedeEtapa: false,
    handoffPolicy: "pause",
    gatilho: () => ({ kind: "lead_created", cancel_on_reply: true }),
    grafo: montarEscada({
      prazoDeRespostaMs: 2 * DIA_MS,
      sim: { rotulo: "Quer participar", padrao: "quero" },
      notaDeResposta: O_ATENDIMENTO_ASSUME,
      toques: [
        {
          rotulo: "Acolhe quem chegou",
          texto:
            "Oi! Que bom ter você por aqui 🙏 Esse é o canal direto com o nosso gabinete: é por aqui que a gente escuta, responde e encaminha o que dá pra resolver. Pode me chamar sempre que precisar.",
        },
        {
          esperaAntesMs: 2 * DIA_MS,
          rotulo: "Abre o convite",
          texto:
            "Passando pra deixar o convite: se tiver uma demanda do seu bairro, uma dúvida ou só quiser acompanhar o trabalho, é só me escrever. A gente lê tudo por aqui.",
        },
        {
          esperaAntesMs: 4 * DIA_MS,
          rotulo: "Convida a se apresentar",
          texto:
            "Por último 🙂 quanto mais a gente se conhece, melhor consigo te ajudar. Quando quiser, me conta de qual região você fala — assim encaminho o que você precisar pra pessoa certa. Estou por aqui.",
        },
      ],
    }),
  },

  {
    id: "politico-pos-atendimento",
    nicho: "politico",
    nome: "Pós-atendimento · confirmar que a pessoa foi bem atendida",
    jornada: "Pós-atendimento",
    resumo:
      "Depois que o gabinete atende alguém, o fluxo volta para confirmar que ficou resolvido e manter a porta aberta.",
    oQueDispara: "Você inscrever a pessoa depois de um atendimento.",
    pedeEtapa: false,
    handoffPolicy: "pause",
    gatilho: () => ({ kind: "manual", cancel_on_reply: true }),
    grafo: montarEscada({
      prazoDeRespostaMs: 3 * DIA_MS,
      sim: { rotulo: "Ficou resolvido", padrao: "resolvido" },
      notaDeResposta: O_ATENDIMENTO_ASSUME,
      toques: [
        {
          // Um dia depois, não na mesma hora: dá tempo de o atendimento fechar e
          // evita falar por cima de quem acabou de ser atendido.
          esperaAntesMs: DIA_MS,
          rotulo: "Pergunta se ajudou",
          texto:
            "Oi! Aqui é do gabinete 🙂 Passando pra saber: conseguimos te ajudar com o que você precisava? Se ficou alguma ponta solta, me conta que eu levo pra equipe.",
        },
        {
          esperaAntesMs: 3 * DIA_MS,
          rotulo: "Confirma que nada ficou solto",
          texto:
            "Só pra confirmar que não ficou nada pelo caminho. Se precisar de mais alguma coisa, ou quiser acompanhar algum assunto do seu bairro, é só responder aqui.",
        },
        {
          esperaAntesMs: 7 * DIA_MS,
          rotulo: "Deixa a porta aberta",
          texto:
            "Por aqui a porta fica sempre aberta 🙏 Sempre que precisar do gabinete, pode me escrever a qualquer hora.",
        },
      ],
    }),
  },

  {
    id: "politico-reconexao",
    nicho: "politico",
    nome: "Reconexão · reaquecer quem esfriou",
    jornada: "Reconexão",
    resumo:
      "A conversa com a pessoa parou faz dias. O fluxo reaquece o vínculo sem cobrar nada, só para manter o contato próximo.",
    oQueDispara: "Uma semana sem a pessoa responder, com a conversa parada.",
    pedeEtapa: false,
    handoffPolicy: "pause",
    // 7 dias = teto do gatilho de silêncio (`threshold_minutes` ≤ 10080). Silêncio
    // mais longo que isso é trabalho de campanha (lista), não de follow-up.
    gatilho: () => ({
      kind: "silence",
      params: { threshold_minutes: 7 * 24 * 60 },
      cancel_on_reply: true,
    }),
    grafo: montarEscada({
      prazoDeRespostaMs: 3 * DIA_MS,
      sim: { rotulo: "Quer retomar", padrao: "quero" },
      notaDeResposta: O_ATENDIMENTO_ASSUME,
      toques: [
        {
          rotulo: "Reaquece o vínculo",
          texto:
            "Oi! Faz um tempinho que a gente não se fala por aqui. Passando só pra dizer que o canal com o gabinete continua aberto — se precisar de algo, é só me chamar 🙂",
        },
        {
          esperaAntesMs: 3 * DIA_MS,
          rotulo: "Oferece novidade",
          texto:
            "Se tiver alguma demanda do seu bairro, ou quiser saber o que a gente tem feito por aí, me escreve que eu te atualizo.",
        },
        {
          esperaAntesMs: 5 * DIA_MS,
          rotulo: "Encerra com a porta aberta",
          texto:
            "Essa é a última mensagem pra não encher a sua caixa 🙏 Mas fica o recado: sempre que precisar, o gabinete está aqui. É só responder.",
        },
      ],
    }),
  },
];
