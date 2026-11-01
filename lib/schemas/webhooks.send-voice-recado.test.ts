import { describe, it, expect } from "vitest";

import { createAutomationRuleSchema } from "./webhooks";
import { regraAniversarioDeVoz } from "@/lib/operacao/regras-de-fabrica";

const UUID = "11111111-1111-4111-8111-111111111111";
const base = { name: "Felicitação de aniversário", trigger_event: "contact.birthday" as const, conditions: [] };

describe("actionSchema — send_voice_recado", () => {
  it("aceita send_voice_recado só com channel_session_id (momento default)", () => {
    const r = createAutomationRuleSchema.safeParse({
      ...base,
      actions: [{ type: "send_voice_recado", config: { channel_session_id: UUID } }],
    });
    expect(r.success).toBe(true);
  });

  it("aceita momento explícito", () => {
    const r = createAutomationRuleSchema.safeParse({
      ...base,
      actions: [{ type: "send_voice_recado", config: { channel_session_id: UUID, momento: "aniversario" } }],
    });
    expect(r.success).toBe(true);
  });

  it("recusa sem channel_session_id", () => {
    const r = createAutomationRuleSchema.safeParse({
      ...base,
      actions: [{ type: "send_voice_recado", config: { momento: "aniversario" } }],
    });
    expect(r.success).toBe(false);
  });

  it("recusa momento fora do conjunto", () => {
    const r = createAutomationRuleSchema.safeParse({
      ...base,
      actions: [{ type: "send_voice_recado", config: { channel_session_id: UUID, momento: "qualquer" } }],
    });
    expect(r.success).toBe(false);
  });

  it("a regra de fábrica de aniversário passa pelo schema da API", () => {
    const regra = regraAniversarioDeVoz(UUID);
    const r = createAutomationRuleSchema.safeParse({
      name: regra.name,
      trigger_event: regra.trigger_event,
      conditions: regra.conditions,
      actions: regra.actions,
    });
    expect(r.success).toBe(true);
  });
});
