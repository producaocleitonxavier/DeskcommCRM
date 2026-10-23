import fs from "node:fs";
import path from "node:path";

import type pg from "pg";
import { describe, expect, it, vi } from "vitest";

import { MAX_VETOS_DE_PROMESSA_DE_CAMPANHA } from "@/lib/agent-engine/agent/inbound-turn";
import {
  BEFORE_SEND_GATES,
  campaignPromiseGate,
  runBeforeSend,
  type GateContext,
} from "@/lib/agent-engine/guardrails/before-send";
import type { Logger } from "@/lib/agent-engine/obs/logger";
import { PACING_DEFAULTS } from "@/lib/agent-engine/pacing/defaults";
import { SPINNING_DEFAULTS } from "@/lib/agent-engine/spinning/defaults";

/**
 * O GATE de promessa de campanha (`campaign_promise`). O detector tem os próprios casos em
 * `lib/agent-engine/guardrails/promessa-de-campanha.test.ts`; aqui se prova o resto do
 * caminho: o gate, a cadeia real, a fiação no turno e o fail-safe (que, como o clínico,
 * NUNCA solta o envio — captação de sufrágio é crime, não "melhor que silêncio").
 *
 * `baseCtx` próprio, pela mesma razão de `gate-afirmacao-clinica.test.ts`.
 */
function baseCtx(overrides: Partial<GateContext> = {}): GateContext {
  return {
    now: new Date("2026-08-04T12:00:00Z"),
    body: "",
    optedOut: false,
    provider: "waha",
    pacing: {
      knobs: PACING_DEFAULTS,
      state: { lastSentAt: null, sentToday: 0, numberActivatedAt: null },
      crmDailyLimit: null,
    },
    spinning: { knobs: SPINNING_DEFAULTS, window: [] },
    promise: { table: null },
    semanticPromise: null,
    disclosure: { template: null, isFirstOutbound: false, mode: "inject" },
    lgpd: null,
    casesEnabled: false,
    hasOpenCase: false,
    openedCaseThisTurn: false,
    ...overrides,
  };
}

// Captação ilícita de sufrágio + promessa de benefício na mesma frase — o pior caso.
const PROMETE = "Vota em mim que eu te consigo a vaga na creche.";
// Só promessa de benefício, para o trace vir com uma categoria limpa.
const SO_BENEFICIO = "Vou conseguir sua aposentadoria ainda este mês.";

describe("campaignPromiseGate — só arma para quem ligou a camada", () => {
  it("armado: veta a promessa de campanha", () => {
    const v = campaignPromiseGate.evaluate(baseCtx({ campaignPromiseEnforced: true, body: PROMETE }));
    expect(v.pass).toBe(false);
    if (v.pass) throw new Error("inalcançável");
    expect(v.code).toBe("campaign_promise");
    expect(v.reason).toMatch(/encaminhar/i);
  });

  it("DESARMADO (campo ausente) é no-op — organização que não é de política não sente nada", () => {
    expect(campaignPromiseGate.evaluate(baseCtx({ body: PROMETE })).pass).toBe(true);
  });

  it("armado + rotina do gabinete passa", () => {
    const v = campaignPromiseGate.evaluate(
      baseCtx({
        campaignPromiseEnforced: true,
        body: "Vou encaminhar seu pedido à secretaria e te retorno com o andamento.",
      }),
    );
    expect(v.pass).toBe(true);
  });

  it("o detail vai ao trace SEM o texto — só as categorias", () => {
    // `detail` é persistido em `before_send_traces`. A frase pode citar o pedido do cidadão
    // (benefício, opinião); a categoria é rótulo nosso, de vocabulário fechado.
    const v = campaignPromiseGate.evaluate(baseCtx({ campaignPromiseEnforced: true, body: SO_BENEFICIO }));
    if (v.pass) throw new Error("inalcançável");
    expect(v.detail).toEqual({ campaign_kinds: "promessa_de_beneficio" });
    expect(JSON.stringify(v.detail)).not.toMatch(/aposentadoria/);
  });

  it("está na cadeia global e é o mesmo objeto exportado", () => {
    expect(BEFORE_SEND_GATES).toContain(campaignPromiseGate);
  });
});

/** A PROPAGAÇÃO pela cadeia REAL: o mesmo corpo, só o flag muda, e o desfecho vira. */
const COMERCIAL = new Date("2026-07-28T13:00:00Z"); // 10h BRT, terça — dentro da janela

function chamaCadeiaReal(args: { body: string; armado: boolean }): {
  run: ReturnType<typeof runBeforeSend>;
  inserts: ReturnType<typeof vi.fn>;
} {
  const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
  const inserts = vi.fn().mockResolvedValue({ rows: [{ id: "trace-1" }] });
  const pool = { connect: vi.fn().mockResolvedValue(client), query: inserts } as unknown as pg.Pool;
  const log: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    inserts,
    run: runBeforeSend({
      pool,
      log,
      tenantId: "00000000-0000-4000-8000-000000000001",
      leadId: "00000000-0000-4000-8000-000000000002",
      jobId: "00000000-0000-4000-8000-000000000003",
      channelSessionId: "00000000-0000-4000-8000-000000000004",
      body: args.body,
      optedOutThisTurn: false,
      crmDailyLimit: null,
      now: COMERCIAL,
      rng: () => 0,
      sleep: async () => {},
      ...(args.armado ? { enforceCampaignPromise: true } : {}),
      send: async () => ({ kind: "sent", idempotencyKey: "k", messageId: "m" }),
    }),
  };
}

describe("a cadeia REAL barra a promessa de campanha — e só quando armada", () => {
  it("armada: veta no gate certo e o trace leva só as categorias", async () => {
    const { run, inserts } = chamaCadeiaReal({ body: SO_BENEFICIO, armado: true });
    const r = await run;
    expect(r.status).toBe("vetoed");
    if (r.status !== "vetoed") throw new Error("inalcançável");
    expect(r.gate).toBe("campaign_promise");
    expect(r.code).toBe("campaign_promise");
    expect(r.trace).toContainEqual({
      gate: "campaign_promise",
      verdict: "veto",
      code: "campaign_promise",
      detail: { campaign_kinds: "promessa_de_beneficio" },
    });
    const sql = String(inserts.mock.calls[0]?.[0] ?? "");
    expect(sql).toMatch(/insert into before_send_traces/);
  });

  it("DESARMADA: o MESMO corpo é enviado", async () => {
    const r = await chamaCadeiaReal({ body: SO_BENEFICIO, armado: false }).run;
    expect(r.status).toBe("sent");
    expect(r.trace).toContainEqual({ gate: "campaign_promise", verdict: "pass" });
  });
});

/**
 * FIAÇÃO — asserção sobre a FONTE, como em `gate-afirmacao-clinica.test.ts`: o turno não
 * tem seam isolável. É guarda de ligação, não prova de execução ponta-a-ponta.
 */
const FONTE_INBOUND = fs.readFileSync(
  path.join(process.cwd(), "lib/agent-engine/agent/inbound-turn.ts"),
  "utf8",
);
const FONTE_FOLLOWUP = fs.readFileSync(
  path.join(process.cwd(), "lib/agent-engine/agent/followup-turn.ts"),
  "utf8",
);
const FONTE_PREVIEW = fs.readFileSync(
  path.join(process.cwd(), "lib/agent-engine/agent/preview.ts"),
  "utf8",
);

function corpoDoExecute(ancora: string, fim: string): string {
  const i = FONTE_INBOUND.indexOf(ancora);
  expect(i, `âncora \`${ancora}\` sumiu do turno`).toBeGreaterThan(-1);
  const j = FONTE_INBOUND.indexOf(fim, i);
  expect(j, `âncora de fim \`${fim}\` sumiu`).toBeGreaterThan(i);
  return FONTE_INBOUND.slice(i, j);
}

describe("fiação do gate — a escolha da organização chega ao send_message", () => {
  it("send_message arma pela camada da organização, com padrão desligado", () => {
    expect(corpoDoExecute("send_message: tool({", "update_lead_state: tool({")).toMatch(
      /enforceCampaignPromise:\s*camadaLigada\(camadas\.promessa_de_campanha,\s*false\)/,
    );
  });

  it("o follow-up determinístico NÃO arma — lá o veto seria drop silencioso", () => {
    expect(FONTE_FOLLOWUP).not.toMatch(/enforceCampaignPromise/);
  });

  it("send_template NÃO arma — o texto é do humano e já aprovado pela Meta", () => {
    expect(corpoDoExecute("send_template: tool({", "search_knowledge: tool({")).not.toMatch(
      /enforceCampaignPromise/,
    );
  });

  it("o fail-safe abre caso e NUNCA libera a frase desarmando o gate", () => {
    // Como o clínico: não existe "promessa eleitoral, mas melhor que silêncio". A
    // insistência chama a equipe (abre caso), e o envio continua barrado.
    const corpo = corpoDoExecute("send_message: tool({", "update_lead_state: tool({");
    expect(corpo).toMatch(/chain\.code === 'campaign_promise'/);
    expect(corpo).toMatch(/campaignPromiseVetoCount \+= 1/);
    expect(corpo).toMatch(/campaignPromiseVetoCount >= MAX_VETOS_DE_PROMESSA_DE_CAMPANHA/);
    const bloco = corpo.slice(corpo.indexOf("chain.code === 'campaign_promise'"));
    expect(bloco.slice(0, bloco.indexOf("internal_vocabulary_leak"))).toMatch(/openCase\(/);
    expect(FONTE_INBOUND).not.toMatch(/enforceCampaignPromise:\s*false/);
  });

  it("o teto do fail-safe deixa ao menos UMA chance de reescrita", () => {
    expect(MAX_VETOS_DE_PROMESSA_DE_CAMPANHA).toBeGreaterThanOrEqual(2);
  });

  it("o preview do agente arma igual ao turno real — senão o teste na tela mente", () => {
    expect(FONTE_PREVIEW).toMatch(/lerCamadasDaOrg/);
    expect(FONTE_PREVIEW).toMatch(/campaignPromiseEnforced:/);
  });
});
