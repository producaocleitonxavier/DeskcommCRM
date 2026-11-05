/**
 * O FREIO DE SAÚDE alcança a campanha — e este arquivo existe porque não
 * alcançava.
 *
 * ## O buraco, medido na auditoria de 05/11/2026
 *
 * O circuito de saúde (`lib/agent-engine/health/circuit.ts`) segura o outbound de
 * um número quando o bloqueio dele passa do limiar — mas ele governa a FILA DO
 * AGENTE (`enforceHolds` retém JOBS), e a campanha não é um job dessa fila: ela
 * roda do cron e chama o handler direto. Resultado: um número que o sistema já
 * marcou como queimando continuava recebendo disparo de campanha. O hold também é
 * ortogonal ao `status` do canal (um número WORKING pode estar em hold), então o
 * corte de `status !== WORKING` que já existia no rodízio não pegava isto.
 *
 * `numerosEmHoldDeSaude` é a leitura que fecha o buraco: a campanha passa a herdar
 * o MESMO flag `health_hold_active` que segura o agente. Estes casos prendem cada
 * ramo — inclusive a FALHA ABERTA, que é a decisão de produto mais fácil de
 * quebrar sem querer (um erro de telemetria não pode calar o disparo).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { numerosEmHoldDeSaude } from "./rodada";

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { logger } from "@/lib/logger";

/**
 * Supabase falso para a consulta de saúde. Grava os argumentos de cada filtro
 * (para provar a FORMA da consulta) e é "thenable": o `await` da cadeia resolve
 * no desfecho que o teste mandar — igual ao builder real do supabase-js.
 */
function fakeAdmin(desfecho: {
  data?: Array<{ channel_session_id: string }> | null;
  error?: { message: string } | null;
}) {
  const calls: {
    from?: string;
    select?: string;
    eq: Array<[string, unknown]>;
    ins: Array<[string, unknown]>;
  } = { eq: [], ins: [] };
  const b: Record<string, unknown> = {
    select: (cols: string) => ((calls.select = cols), b),
    eq: (col: string, val: unknown) => (calls.eq.push([col, val]), b),
    in: (col: string, val: unknown) => (calls.ins.push([col, val]), b),
    then: (resolve: (r: unknown) => void) =>
      resolve({ data: desfecho.data ?? null, error: desfecho.error ?? null }),
  };
  const admin = {
    from: (t: string) => ((calls.from = t), b),
  } as never;
  return { admin, calls };
}

const ORG = "org-1";

describe("freio de saúde alcança o rodízio da campanha", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sem números no pool, nem consulta o banco — conjunto vazio", async () => {
    const { admin, calls } = fakeAdmin({ data: [{ channel_session_id: "n1" }] });
    const r = await numerosEmHoldDeSaude(admin, ORG, []);
    expect(r.size).toBe(0);
    // Curto-circuito: não chega a tocar no banco com um `in ()` vazio.
    expect(calls.from).toBeUndefined();
  });

  it("devolve os números em hold como conjunto", async () => {
    const { admin } = fakeAdmin({
      data: [{ channel_session_id: "n2" }, { channel_session_id: "n5" }],
    });
    const r = await numerosEmHoldDeSaude(admin, ORG, ["n1", "n2", "n5"]);
    expect(r.has("n2")).toBe(true);
    expect(r.has("n5")).toBe(true);
    expect(r.has("n1")).toBe(false);
    expect(r.size).toBe(2);
  });

  it("nenhum número em hold — conjunto vazio, campanha livre", async () => {
    const { admin } = fakeAdmin({ data: [] });
    const r = await numerosEmHoldDeSaude(admin, ORG, ["n1", "n2"]);
    expect(r.size).toBe(0);
  });

  it("FALHA ABERTA: erro na leitura NÃO cala o disparo — vazio + aviso", async () => {
    // A régua mais fácil de quebrar sem querer: se um dia alguém trocar o
    // `return new Set()` por um `throw`, o erro de telemetria passaria a derrubar
    // toda campanha do número. Este caso fica vermelho se isso acontecer.
    const { admin } = fakeAdmin({ error: { message: "relation does not exist" } });
    const r = await numerosEmHoldDeSaude(admin, ORG, ["n1", "n2"]);
    expect(r.size).toBe(0);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("a consulta filtra por health_hold_active = true e pelo pool de números", async () => {
    // Sem o `health_hold_active=true`, a campanha trataria QUALQUER número com
    // linha de saúde como em hold e pararia sozinha. Sem o `in(numeros)`, leria o
    // hold de números de outra campanha. Os dois filtros são o contrato.
    const { admin, calls } = fakeAdmin({ data: [] });
    await numerosEmHoldDeSaude(admin, ORG, ["n1", "n2"]);
    expect(calls.from).toBe("channel_session_health");
    expect(calls.ins).toContainEqual(["channel_session_id", ["n1", "n2"]]);
    expect(calls.eq).toContainEqual(["health_hold_active", true]);
    expect(calls.eq).toContainEqual(["organization_id", ORG]);
  });

  it("SÓ queima entra no filtro — go_live NÃO (senão congela pré-go-live)", async () => {
    // A lição da checagem em produção (05/nov): o número do piloto estava em hold
    // de `go_live` (número novo, pré-go-live). Se o freio da campanha respeitasse
    // esse motivo, TODA campanha de um gabinete em pré-go-live congelaria. O freio
    // só pode frear por QUEIMA. Se alguém tirar este filtro, este caso fica vermelho.
    const { admin, calls } = fakeAdmin({ data: [] });
    await numerosEmHoldDeSaude(admin, ORG, ["n1"]);
    expect(calls.ins).toContainEqual(["health_hold_reason", ["block_rate", "response_rate"]]);
    // E o motivo go_live NÃO pode estar no filtro.
    const reasonFilter = calls.ins.find(([col]) => col === "health_hold_reason");
    expect(reasonFilter?.[1]).not.toContain("go_live");
  });

  it("linha repetida no retorno não duplica — o conjunto deduplica", async () => {
    const { admin } = fakeAdmin({
      data: [{ channel_session_id: "n2" }, { channel_session_id: "n2" }],
    });
    const r = await numerosEmHoldDeSaude(admin, ORG, ["n2"]);
    expect(r.size).toBe(1);
    expect(r.has("n2")).toBe(true);
  });

  it("CONTROLE: data null (sem a coluna/sem retorno) é tratado como vazio, não como erro", async () => {
    // `data: null, error: null` é o que o PostgREST devolve em alguns caminhos —
    // não pode virar exceção nem conjunto fantasma.
    const { admin } = fakeAdmin({ data: null, error: null });
    const r = await numerosEmHoldDeSaude(admin, ORG, ["n1"]);
    expect(r.size).toBe(0);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
