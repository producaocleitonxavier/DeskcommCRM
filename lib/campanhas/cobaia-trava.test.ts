/**
 * `checarEnvioCobaia` é o guarda do PONTO ÚNICO de envio (sendMessageHandler):
 * numa org-laboratório só passa quem está na allowlist-semente, para TODO
 * remetente (inclusive humano). Além da linha no banco, a variável
 * `COBAIA_ORG_IDS` força o laboratório mesmo que a linha suma ou a leitura do
 * controle falhe — DEFESA EM PROFUNDIDADE que fecha a falha-ABERTA do controle.
 *
 * Anti-tautologia: o caso "org no env + erro ao ler o controle" (falha-ABERTA do
 * banco) TEM de continuar bloqueando. Se alguém fizer o env parar de valer, esse
 * caso fica vermelho — que é o ponto.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checarEnvioCobaia } from "./cobaia-trava";

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

type Desfecho = { data?: unknown; error?: { message: string } | null };

/** Supabase falso: um desfecho por tabela; thenable no `.eq()`, Promise no `.maybeSingle()`. */
function fakeDb(desfechos: { controle?: Desfecho; semente?: Desfecho }) {
  function builder(tabela: string): Record<string, unknown> {
    const d = tabela === "pol_cobaia_controle" ? desfechos.controle : desfechos.semente;
    const resolvido = { data: d?.data ?? null, error: d?.error ?? null };
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      maybeSingle: () => Promise.resolve(resolvido),
      then: (resolve: (r: unknown) => void) => resolve(resolvido),
    };
    return b;
  }
  return { from: (t: string) => builder(t) } as never;
}

const ORG = "org-cobaia-1";
const SEMENTE_FORMATADA = "+55 (31) 99999-0001";
const DESTINO_SEMENTE = "5531999990001"; // mesmos dígitos da semente formatada
const DESTINO_FORA = "5531988887777";

const envAntes = process.env.COBAIA_ORG_IDS;
beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.COBAIA_ORG_IDS;
});
afterEach(() => {
  if (envAntes === undefined) delete process.env.COBAIA_ORG_IDS;
  else process.env.COBAIA_ORG_IDS = envAntes;
});

describe("checarEnvioCobaia — trava no ponto único de envio", () => {
  it("org NORMAL (sem linha, fora do env) → NÃO bloqueia (no-op)", async () => {
    const db = fakeDb({ controle: { data: null } });
    const r = await checarEnvioCobaia(db, ORG, DESTINO_FORA);
    expect(r.bloqueado).toBe(false);
  });

  it("cobaia + destino na allowlist → libera", async () => {
    const db = fakeDb({
      controle: { data: { modo_cobaia: true, envio_pausado: false } },
      semente: { data: [{ telefone: SEMENTE_FORMATADA }] },
    });
    const r = await checarEnvioCobaia(db, ORG, DESTINO_SEMENTE);
    expect(r.bloqueado).toBe(false);
  });

  it("cobaia + destino FORA da allowlist → bloqueia", async () => {
    const db = fakeDb({
      controle: { data: { modo_cobaia: true, envio_pausado: false } },
      semente: { data: [{ telefone: SEMENTE_FORMATADA }] },
    });
    const r = await checarEnvioCobaia(db, ORG, DESTINO_FORA);
    expect(r.bloqueado).toBe(true);
    expect(r.motivo).toBe("cobaia:destino_fora_da_allowlist");
  });

  it("BOTÃO DE PÂNICO: pausado bloqueia até a semente", async () => {
    const db = fakeDb({
      controle: { data: { modo_cobaia: true, envio_pausado: true } },
      semente: { data: [{ telefone: SEMENTE_FORMATADA }] },
    });
    const r = await checarEnvioCobaia(db, ORG, DESTINO_SEMENTE);
    expect(r.bloqueado).toBe(true);
    expect(r.motivo).toBe("cobaia:envio_pausado");
  });

  it("DEFESA EM PROFUNDIDADE: org no COBAIA_ORG_IDS SEM linha no banco → bloqueia tudo (fail-closed)", async () => {
    process.env.COBAIA_ORG_IDS = `outra-org, ${ORG} `;
    const db = fakeDb({ controle: { data: null } }); // sem linha no banco
    const r = await checarEnvioCobaia(db, ORG, DESTINO_SEMENTE);
    expect(r.bloqueado).toBe(true);
    expect(r.motivo).toBe("cobaia:destino_fora_da_allowlist");
  });

  it("ANTI-TAUTOLOGIA: org no env + ERRO ao ler o controle (falha-aberta do banco) → ainda bloqueia", async () => {
    process.env.COBAIA_ORG_IDS = ORG;
    const db = fakeDb({ controle: { error: { message: "timeout" } } });
    const r = await checarEnvioCobaia(db, ORG, DESTINO_SEMENTE);
    expect(r.bloqueado).toBe(true);
  });

  it("o env não quebra o legítimo: org no env COM linha e destino na semente → libera", async () => {
    process.env.COBAIA_ORG_IDS = ORG;
    const db = fakeDb({
      controle: { data: { modo_cobaia: true, envio_pausado: false } },
      semente: { data: [{ telefone: SEMENTE_FORMATADA }] },
    });
    const r = await checarEnvioCobaia(db, ORG, DESTINO_SEMENTE);
    expect(r.bloqueado).toBe(false);
  });

  it("CONTROLE NEGATIVO: org real (fora do env, sem linha) não bloqueia nem destino estranho", async () => {
    const db = fakeDb({ controle: { data: null } });
    const r = await checarEnvioCobaia(db, "org-real-cliente", DESTINO_FORA);
    expect(r.bloqueado).toBe(false);
  });
});
