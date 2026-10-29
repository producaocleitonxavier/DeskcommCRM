/**
 * Capacidades do GABINETE — o pacote "Atender o cidadão".
 *
 * É o que faz a IA do mandato DEIXAR DE SÓ CONVERSAR e passar a RESOLVER: quando
 * o cidadão relata um problema no WhatsApp, o agente REGISTRA a demanda (o que,
 * onde, de que tipo) já pronta para o gabinete encaminhar ao órgão competente —
 * exatamente como um assessor faria ao atender. E consulta se o cidadão já tem
 * demanda aberta, para não duplicar.
 *
 * ⚠️ O agente NUNCA promete resolver nem encaminha sozinho — só REGISTRA. O
 * encaminhamento (ofício ao órgão) e a promessa seguem com a pessoa + guardrail
 * de campanha. Este texto fala com o HUMANO (chefe de gabinete) que configura o
 * agente; o texto que vai ao MODELO é a `description` do handler
 * (`lib/mcp/tools/gabinete.ts`).
 */
import { declararTools } from "./tipos";

export const TOOLS_GABINETE = declararTools([
  {
    name: "crm_registrar_demanda",
    category: "write",
    rotulo: "Registrar a demanda do cidadão",
    explicacao:
      "Abre uma demanda do gabinete a partir do que o cidadão pediu na conversa — com o assunto, o tipo e o endereço do problema — já pronta na tela para um assessor encaminhar. O agente não promete nada, só registra.",
    oQueToca: "Demandas do gabinete",
    // `atencao`: cria um registro interno (reversível — o assessor vê e pode
    // excluir na tela). Não fala com ninguém de fora, não encaminha, não promete.
    // Por isso entra ligado pelo pacote Gabinete (não é `critico`).
    risco: "atencao",
    pacotes: ["gabinete"],
  },
  {
    name: "crm_listar_demandas_cidadao",
    category: "read",
    rotulo: "Ver as demandas que o cidadão já abriu",
    explicacao:
      "Mostra as demandas que aquele cidadão já tem no gabinete e em que pé estão — para o agente não registrar a mesma coisa duas vezes e saber o histórico antes de responder.",
    oQueToca: "Demandas do gabinete",
    risco: "seguro",
    pacotes: ["gabinete"],
  },
]);
