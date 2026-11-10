/**
 * OS FOLLOW-UPS DE RELACIONAMENTO DE UM GABINETE — boas-vindas e pós-atendimento.
 *
 * O motor de follow-up é o mesmo da clínica (`escada.ts`); o que muda é a VOZ e
 * o RELÓGIO. Um gabinete não "vende" nem "marca consulta": ele constrói
 * relacionamento com o cidadão entre uma eleição e outra. Mas a lição de 2026 (o
 * cliente, direto): **mensagem demais pra quem nunca respondeu é a zona onde o
 * WhatsApp bane, e não constrói nada.** Por isso aqui são POUCAS mensagens e
 * SEMPRE ancoradas num momento real do relacionamento — nunca "cobrança de
 * silêncio" numa base fria.
 *
 * DOIS fluxos, enxutos (2 toques cada):
 *   1. BOAS-VINDAS — quem acabou de chegar: acolhe e, 5 dias depois, oferece
 *      receber conteúdo (vídeos/ebooks) em primeira mão — OPT-IN, não insistência.
 *   2. PÓS-ATENDIMENTO — quem o gabinete acabou de atender: confirma que ficou
 *      bem e mantém a porta aberta.
 * O que FICOU DE FORA de propósito: "Reconexão por silêncio" (3 toques pra quem
 * sumiu) — mais risco de ban, menos valor; relacionamento com quem esfriou é
 * trabalho de conteúdo/evento, não de robô falando por cima. Os follow-ups que
 * mais valem — demanda vencida ("estamos cobrando") e saúde/UPA ("como você
 * está?") — são ANCORADOS NO TRABALHO e vivem nas suas próprias telas (botão no
 * detalhe da demanda; modo assistido), não aqui.
 *
 * ⚠️ 3 CHIPS (arquitetura de números): estes são disparos de RELACIONAMENTO À
 * BASE → têm de sair pelo CHIP DE RELACIONAMENTO (o número do pool de base),
 * NUNCA pelo chip de Atendimento/inbound nem pelo Operacional interno. O
 * roteamento por chip é um passo de ARMAR (seleção de canal), não do desenho do
 * fluxo — mas fica aqui registrado pra não esquecer na hora de ligar no agente.
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
 * 4. **`cancel_on_reply: true` nos dois.** Respondeu qualquer coisa, a inscrição
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
    nome: "Boas-vindas · acolher e oferecer conteúdo",
    jornada: "Boas-vindas",
    resumo:
      "Alguém novo entrou em contato com o mandato. O fluxo acolhe e, 5 dias depois, oferece receber vídeos e conteúdos em primeira mão — opt-in, sem pedir voto.",
    oQueDispara: "Um novo contato entrar no sistema.",
    pedeEtapa: false,
    handoffPolicy: "pause",
    gatilho: () => ({ kind: "lead_created", cancel_on_reply: true }),
    grafo: montarEscada({
      prazoDeRespostaMs: 3 * DIA_MS,
      sim: { rotulo: "Quer receber conteúdo", padrao: "sim" },
      notaDeResposta: O_ATENDIMENTO_ASSUME,
      toques: [
        {
          rotulo: "Acolhe quem chegou",
          texto:
            "Oi! Que bom ter você por aqui 🙏 Esse é o canal direto com o nosso gabinete: é por aqui que a gente escuta, responde e encaminha o que dá pra resolver. Pode me chamar sempre que precisar.",
        },
        {
          esperaAntesMs: 5 * DIA_MS,
          rotulo: "Oferece conteúdo (opt-in)",
          texto:
            "Passando pra te perguntar: você gostaria de receber, em primeira mão, os vídeos e conteúdos (como ebooks) que a gente produz? Se quiser, é só responder SIM que eu te incluo 🙂 Se preferir não receber, é só me dizer — sem problema nenhum.",
        },
      ],
    }),
  },

  {
    id: "politico-pos-atendimento",
    nicho: "politico",
    nome: "Pós-atendimento · confirmar que ficou bem atendido",
    jornada: "Pós-atendimento",
    resumo:
      "Depois que o gabinete atende alguém, o fluxo volta uma vez pra confirmar que ficou resolvido e manter a porta aberta.",
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
          esperaAntesMs: 5 * DIA_MS,
          rotulo: "Deixa a porta aberta",
          texto:
            "Por aqui a porta fica sempre aberta 🙏 Sempre que precisar do gabinete, ou quiser acompanhar algum assunto do seu bairro, é só responder aqui.",
        },
      ],
    }),
  },
];
