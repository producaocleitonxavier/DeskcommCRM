/**
 * A TRAVA DE COBAIA protege a LINHA VERMELHA no código: num gabinete de
 * laboratório (org-cobaia), o disparo de campanha só pode mandar para telefone
 * que está na allowlist (as sementes nossas), e um botão de pânico para tudo na
 * hora. Org REAL de cliente não tem controle nenhum e não é restringida.
 *
 * O que estes casos prendem — cada ramo, porque é caminho de ENVIO:
 *  · org normal não é tocada (e nem gasta a consulta das sementes);
 *  · o botão de pânico é lido;
 *  · a allowlist casa por SÓ-DÍGITOS (formato não importa);
 *  · e as DUAS falhas de propósito: ABERTA no controle (erro não para cliente),
 *    FECHADA nas sementes (laboratório sem allowlist legível não manda nada).
 * A falha-fechada é a régua mais fácil de quebrar sem querer; se alguém trocar o
 * `new Set()` por um valor "permissivo", o caso #6 fica vermelho.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { soDigitos, travaDeCobaia } from "./rodada";

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { logger } from "@/lib/logger";

type Desfecho = { data?: unknown; error?: { message: string } | null };

/**
 * Supabase falso. Devolve um desfecho por TABELA e grava quais tabelas foram
 * consultadas (para provar que org normal nem toca nas sementes). "thenable"
 * para o `.eq()` final, e `.maybeSingle()` devolve a Promise do controle.
 */
function fakeAdmin(desfechos: { controle?: Desfecho; semente?: Desfecho }) {
  const calls: { tabelas: string[] } = { tabelas: [] };
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
  const admin = {
    from: (t: string) => {
      calls.tabelas.push(t);
      return builder(t);
    },
  } as never;
  return { admin, calls };
}

const ORG = "org-cobaia-1";

describe("trava de cobaia — allowlist e botão de pânico", () => {
  beforeEach(() => vi.clearAllMocks());

  it("org NORMAL (sem linha de controle) → sem restrição, e nem consulta as sementes", async () => {
    const { admin, calls } = fakeAdmin({ controle: { data: null } });
    const t = await travaDeCobaia(admin, ORG);
    expect(t.cobaia).toBe(false);
    expect(t.pausado).toBe(false);
    expect(t.sementes.size).toBe(0);
    // Curto-circuito: org real não paga a 2ª consulta.
    expect(calls.tabelas).toEqual(["pol_cobaia_controle"]);
  });

  it("org COBAIA com sementes → cobaia=true e a allowlist carregada", async () => {
    const { admin, calls } = fakeAdmin({
      controle: { data: { modo_cobaia: true, envio_pausado: false } },
      semente: { data: [{ telefone: "5531999990001" }, { telefone: "5531999990002" }] },
    });
    const t = await travaDeCobaia(admin, ORG);
    expect(t.cobaia).toBe(true);
    expect(t.sementes.has("5531999990001")).toBe(true);
    expect(t.sementes.has("5531999990002")).toBe(true);
    expect(t.sementes.size).toBe(2);
    expect(calls.tabelas).toContain("pol_cobaia_semente");
  });

  it("BOTÃO DE PÂNICO: envio_pausado=true é lido como pausado", async () => {
    const { admin } = fakeAdmin({
      controle: { data: { modo_cobaia: true, envio_pausado: true } },
      semente: { data: [] },
    });
    const t = await travaDeCobaia(admin, ORG);
    expect(t.pausado).toBe(true);
    expect(t.cobaia).toBe(true);
  });

  it("modo_cobaia=false explícito → não restringe e não lê sementes", async () => {
    const { admin, calls } = fakeAdmin({
      controle: { data: { modo_cobaia: false, envio_pausado: false } },
    });
    const t = await travaDeCobaia(admin, ORG);
    expect(t.cobaia).toBe(false);
    expect(calls.tabelas).toEqual(["pol_cobaia_controle"]);
  });

  it("FALHA-ABERTA: erro ao ler o CONTROLE não para a campanha — trata como org normal + aviso", async () => {
    const { admin, calls } = fakeAdmin({ controle: { error: { message: "timeout" } } });
    const t = await travaDeCobaia(admin, ORG);
    expect(t.cobaia).toBe(false);
    expect(t.pausado).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
    // Não escalou para erro, nem foi às sementes.
    expect(logger.error).not.toHaveBeenCalled();
    expect(calls.tabelas).toEqual(["pol_cobaia_controle"]);
  });

  it("FALHA-FECHADA: é cobaia mas erro ao ler as SEMENTES → conjunto vazio (recusa tudo) + erro", async () => {
    const { admin } = fakeAdmin({
      controle: { data: { modo_cobaia: true, envio_pausado: false } },
      semente: { error: { message: "relation does not exist" } },
    });
    const t = await travaDeCobaia(admin, ORG);
    expect(t.cobaia).toBe(true); // continua laboratório
    expect(t.sementes.size).toBe(0); // vazio => nenhum destino casa => tudo recusado
    expect(logger.error).toHaveBeenCalled();
  });

  it("a allowlist casa por SÓ-DÍGITOS: semente formatada = contato cru; estranho não casa", async () => {
    const { admin } = fakeAdmin({
      controle: { data: { modo_cobaia: true, envio_pausado: false } },
      semente: { data: [{ telefone: "+55 (31) 99999-0001" }] },
    });
    const t = await travaDeCobaia(admin, ORG);
    expect(t.sementes.has(soDigitos("5531999990001"))).toBe(true);
    // CONTROLE negativo: um número que NÃO é semente nunca pode passar.
    expect(t.sementes.has(soDigitos("5531988887777"))).toBe(false);
  });

  it("soDigitos tira +55, parênteses, espaços e traços; nulo vira vazio", () => {
    expect(soDigitos("+55 (31) 99999-0001")).toBe("5531999990001");
    expect(soDigitos(null)).toBe("");
    expect(soDigitos(undefined)).toBe("");
    expect(soDigitos("")).toBe("");
  });
});
