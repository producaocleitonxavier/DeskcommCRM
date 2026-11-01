/**
 * REGRAS DE AUTOMAÇÃO "DE FÁBRICA" do gabinete — dado reutilizável que o pacote
 * de onboarding (e os seeds) criam para um gabinete novo, pra "o cliente ligar e
 * estar operando".
 *
 * Separado do seeder DE PROPÓSITO (mesmo padrão de
 * `scripts/lib/automacoes-de-demonstracao.ts`): aqui é só dado, então o teste
 * pode passar cada regra pelo `createAutomationRuleSchema`/`actionSchema` de
 * verdade sem rodar nenhum seeder. `automation_rules.conditions`/`actions` são
 * `jsonb`, e o banco aceita uma ação que o motor nunca executa — o schema é quem
 * pega isso.
 */

export const REGRA_ANIVERSARIO_NOME = "Felicitação de aniversário";

export interface RegraDeFabrica {
  name: string;
  trigger_event: string;
  conditions: ReadonlyArray<{ field: string; op: "eq" | "neq" | "contains"; value: string }>;
  actions: ReadonlyArray<{ type: string; config: Record<string, unknown> }>;
}

/**
 * Felicitação de aniversário por MENSAGEM DE VOZ.
 *
 * Gatilho `contact.birthday` (o cron `contact-birthdays` emite o evento no fuso
 * da org, às 9h, para orgs que tenham ESTA regra ativa). Ação `send_voice_recado`
 * gera o áudio na voz clonada do político com o nome da pessoa + o aviso de IA do
 * TSE, e envia. `channelSessionId` é o número de WhatsApp que "fala".
 *
 * Sem condição: todo aniversariante com telefone e sem opt-out. As travas que
 * importam (voz armada, consentimento, blackout, opt-out) são estruturais na
 * ação/no helper, não configuração que se desliga sem querer.
 */
export function regraAniversarioDeVoz(channelSessionId: string): RegraDeFabrica {
  return {
    name: REGRA_ANIVERSARIO_NOME,
    trigger_event: "contact.birthday",
    conditions: [],
    actions: [
      { type: "send_voice_recado", config: { channel_session_id: channelSessionId, momento: "aniversario" } },
    ],
  };
}
