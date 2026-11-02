import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeDb, type Op, type FakeResult } from "@/tests/fake/fake-supabase";

vi.mock("@/lib/politico/engajamento", () => ({
  recomputarEngajamento: vi.fn(async () => ({ temLead: true, score: 0, estagio: "x", avancou: false })),
}));
vi.mock("@/lib/politico/enviar-material", () => ({ enviarTextoNoCanal: vi.fn(async () => undefined) }));
vi.mock("@/lib/politico/identidade-do-mandato", () => ({
  lerIdentidadeDoMandato: vi.fn(async () => ({})),
  novidadesDeLabel: vi.fn(() => "as novidades"),
}));

import { enviarTextoNoCanal } from "@/lib/politico/enviar-material";
import {
  extrairCodigoIndicacao,
  codigoDeIndicacao,
  registrarIndicacao,
  processarIndicacao,
  convidarAIndicar,
} from "./indicacao";

const ORG = "org-1";

describe("extrairCodigoIndicacao — padrão [ind:CODE]", () => {
  it.each([
    ["[ind:ABCD]", "ABCD"],
    ["[ind:abcd]", "ABCD"], // minúsculo → caixa alta
    ["[IND:abcd]", "ABCD"], // prefixo case-insensitive
    ["[Ind:aB12]", "AB12"],
    ["oi, me indicaram [ind:XY12] valeu", "XY12"],
    ["prefixo[ind:Z9Z9]sufixo", "Z9Z9"],
    ["[ind:1234]", "1234"], // só dígitos
    ["[ind:A1B2C3]", "A1B2C3"],
    ["[ind:ABCDEFGHIJKL]", "ABCDEFGHIJKL"], // 12 = máximo
    ["[ind:AB12cd]", "AB12CD"],
    ["linha1\n[ind:mix9]\nlinha2", "MIX9"],
    ["[ind:AAAA] e [ind:BBBB]", "AAAA"], // primeiro vence
  ])("extrai de %j → %s", (texto, esperado) => {
    expect(extrairCodigoIndicacao(texto)).toBe(esperado);
  });

  it.each([
    [null],
    [""],
    ["sem codigo nenhum"],
    ["[ind:ABC]"], // 3 = curto demais
    ["[ind:ABCDEFGHIJKLM]"], // 13 = longo demais
    ["[ind:AB-CD]"], // hífen inválido
    ["[ind:AB CD]"], // espaço inválido
    ["[ind: ABCD]"], // espaço antes
    ["[ind:]"], // vazio
    ["[qr:ABCD]"], // outro prefixo (ponto)
    ["[ref:ABCD]"], // outro prefixo (anúncio)
    ["ind:ABCD]"], // sem colchete de abertura
    ["[ind:ABCD"], // sem fechamento
    ["ABCD"], // sem marcação
    ["[IND:@#$%]"], // símbolos
  ])("não extrai de %j → null", (texto) => {
    expect(extrairCodigoIndicacao(texto as string | null)).toBeNull();
  });

  it.each([4, 5, 6, 7, 8, 9, 10, 11, 12])("comprimento %i é válido", (n) => {
    const code = "A".repeat(n);
    expect(extrairCodigoIndicacao(`[ind:${code}]`)).toBe(code);
  });
  it.each([0, 1, 2, 3, 13, 14, 20])("comprimento %i é inválido", (n) => {
    const code = "A".repeat(n);
    expect(extrairCodigoIndicacao(`[ind:${code}]`)).toBeNull();
  });
});

/** contacts com roteiro stateful (leitura inicial / update / releitura). */
function dbCodigo(roteiro: { selects: (FakeResult | "THROW")[]; updates: (FakeResult | "ECHO")[] }) {
  let si = 0;
  let ui = 0;
  return makeDb({
    contacts: (ops: Op[]): FakeResult => {
      if (ops.some((o) => o.m === "update")) {
        const spec = roteiro.updates[Math.min(ui, roteiro.updates.length - 1)]!;
        ui++;
        if (spec === "ECHO") {
          const sent = ops.find((o) => o.m === "update")!.args[0] as { codigo_indicacao: string };
          return { data: { codigo_indicacao: sent.codigo_indicacao }, error: null };
        }
        return spec;
      }
      const spec = roteiro.selects[Math.min(si, roteiro.selects.length - 1)]!;
      si++;
      if (spec === "THROW") throw new Error("db down");
      return spec;
    },
  });
}
const ALFABETO_OK = /^[2-9ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

describe("codigoDeIndicacao — pega-ou-cria (compare-and-set)", () => {
  it("código já existe → devolve, novo:false, NÃO faz update", async () => {
    const db = dbCodigo({ selects: [{ data: { codigo_indicacao: "EXIST1" } }], updates: [] });
    const r = await codigoDeIndicacao(db as never, ORG, "c1");
    expect(r).toEqual({ codigo: "EXIST1", novo: false });
    expect(db.__calls.some((c) => c.ops?.some((o) => o.m === "update"))).toBe(false);
  });

  it("sem código → cria um novo (alfabeto sem ambíguos, 6 chars), novo:true", async () => {
    const db = dbCodigo({ selects: [{ data: { codigo_indicacao: null } }], updates: ["ECHO"] });
    const r = await codigoDeIndicacao(db as never, ORG, "c1");
    expect(r.novo).toBe(true);
    expect(r.codigo).toMatch(ALFABETO_OK);
  });

  it("corrida 23505 na 1ª tentativa → tenta outro e cria (novo:true)", async () => {
    const db = dbCodigo({
      selects: [{ data: { codigo_indicacao: null } }],
      updates: [{ error: { message: "dup", code: "23505" } }, "ECHO"],
    });
    const r = await codigoDeIndicacao(db as never, ORG, "c1");
    expect(r.novo).toBe(true);
    expect(r.codigo).toMatch(ALFABETO_OK);
  });

  it("erro não-23505 → relê; se já tem código, devolve novo:false", async () => {
    const db = dbCodigo({
      selects: [{ data: { codigo_indicacao: null } }, { data: { codigo_indicacao: "RELIDO" } }],
      updates: [{ error: { message: "boom", code: "42501" } }],
    });
    const r = await codigoDeIndicacao(db as never, ORG, "c1");
    expect(r).toEqual({ codigo: "RELIDO", novo: false });
  });

  it("6 tentativas todas 23505 → codigo:null", async () => {
    const db = dbCodigo({
      selects: [{ data: { codigo_indicacao: null } }],
      updates: Array(6).fill({ error: { message: "dup", code: "23505" } }),
    });
    const r = await codigoDeIndicacao(db as never, ORG, "c1");
    expect(r).toEqual({ codigo: null, novo: false });
  });

  it("exceção na leitura → fail-soft (codigo:null)", async () => {
    const db = dbCodigo({ selects: ["THROW"], updates: [] });
    const r = await codigoDeIndicacao(db as never, ORG, "c1");
    expect(r).toEqual({ codigo: null, novo: false });
  });

  it("update de criação filtra por codigo_indicacao IS NULL (compare-and-set)", async () => {
    const db = dbCodigo({ selects: [{ data: { codigo_indicacao: null } }], updates: ["ECHO"] });
    await codigoDeIndicacao(db as never, ORG, "c1");
    const upd = db.__calls.find((c) => c.ops?.some((o) => o.m === "update"))!;
    expect(upd.ops!.some((o) => o.m === "is" && o.args[0] === "codigo_indicacao")).toBe(true);
  });
});

function dbRegistrar(roteiro: { indicador: FakeResult; insert?: FakeResult }) {
  return makeDb({
    contacts: () => roteiro.indicador,
    pol_indicacoes: () => roteiro.insert ?? { error: null },
  });
}

describe("registrarIndicacao — crédito (first-touch, não-self)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("código desconhecido → não credita", async () => {
    const r = await registrarIndicacao(dbRegistrar({ indicador: { data: null } }) as never, ORG, "indicado", "XX");
    expect(r).toEqual({ creditou: false, motivo: "codigo_desconhecido" });
  });

  it("auto-indicação (indicador === indicado) → bloqueia", async () => {
    const r = await registrarIndicacao(dbRegistrar({ indicador: { data: { id: "mesmo" } } }) as never, ORG, "mesmo", "CODE");
    expect(r).toEqual({ creditou: false, motivo: "auto_indicacao" });
  });

  it("crédito novo → creditou:true + indicador", async () => {
    const r = await registrarIndicacao(
      dbRegistrar({ indicador: { data: { id: "IND" } }, insert: { error: null } }) as never,
      ORG,
      "novo",
      "CODE",
    );
    expect(r).toEqual({ creditou: true, indicadorContactId: "IND" });
  });

  it.each(["23505", "23514"])("conflito %s (já creditado/self no banco) → ja_creditado", async (code) => {
    const r = await registrarIndicacao(
      dbRegistrar({ indicador: { data: { id: "IND" } }, insert: { error: { message: "x", code } } }) as never,
      ORG,
      "novo",
      "CODE",
    );
    expect(r).toEqual({ creditou: false, indicadorContactId: "IND", motivo: "ja_creditado" });
  });

  it("erro genérico no insert → motivo truncado em 80", async () => {
    const msg = "E".repeat(200);
    const r = await registrarIndicacao(
      dbRegistrar({ indicador: { data: { id: "IND" } }, insert: { error: { message: msg, code: "42501" } } }) as never,
      ORG,
      "novo",
      "CODE",
    );
    expect(r.creditou).toBe(false);
    expect(r.motivo).toBe(msg.slice(0, 80));
  });

  it("exceção → excecao (fail-soft)", async () => {
    const db = makeDb({
      contacts: () => {
        throw new Error("db down");
      },
    });
    const r = await registrarIndicacao(db as never, ORG, "novo", "CODE");
    expect(r).toEqual({ creditou: false, motivo: "excecao" });
  });
});

describe("processarIndicacao — orquestração", () => {
  beforeEach(() => vi.clearAllMocks());

  it("código desconhecido → skipped (não cria lead)", async () => {
    const db = makeDb({ contacts: () => ({ data: null }) });
    const r = await processarIndicacao(db as never, {
      organizationId: ORG,
      contactId: "c1",
      codigo: "ZZ",
      canalId: "ch1",
    });
    expect(r.status).toBe("skipped");
    expect(r.detail).toContain("ZZ");
    expect(db.__calls.some((c) => c.table === "pol_leads")).toBe(false);
  });

  it("crédito novo + canal → ok:creditado e acolhe (envia texto)", async () => {
    const db = makeDb({
      contacts: (ops) => (ops.some((o) => o.m === "update") ? { error: null } : { data: { id: "IND" } }),
      pol_indicacoes: () => ({ error: null }),
      pol_leads: (ops) => (ops.some((o) => o.m === "insert") ? { error: null } : { data: null }),
    });
    const r = await processarIndicacao(db as never, {
      organizationId: ORG,
      contactId: "novo",
      codigo: "CODE",
      canalId: "ch1",
    });
    expect(r.status).toBe("ok");
    expect(r.detail).toBe("creditado:IND");
    expect(enviarTextoNoCanal).toHaveBeenCalledTimes(1);
  });

  it("sem canal → não envia acolhimento", async () => {
    const db = makeDb({
      contacts: (ops) => (ops.some((o) => o.m === "update") ? { error: null } : { data: { id: "IND" } }),
      pol_indicacoes: () => ({ error: null }),
      pol_leads: (ops) => (ops.some((o) => o.m === "insert") ? { error: null } : { data: null }),
    });
    await processarIndicacao(db as never, { organizationId: ORG, contactId: "novo", codigo: "CODE", canalId: null });
    expect(enviarTextoNoCanal).not.toHaveBeenCalled();
  });
});

describe("convidarAIndicar — convite uma vez só", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sem canal → não faz nada", async () => {
    const db = makeDb({});
    await convidarAIndicar(db as never, { organizationId: ORG, contactId: "c1", canalId: null });
    expect(enviarTextoNoCanal).not.toHaveBeenCalled();
    expect(db.__calls).toHaveLength(0);
  });

  it("já tem código (já foi convidado) → não convida de novo", async () => {
    const db = makeDb({ contacts: () => ({ data: { codigo_indicacao: "JATEM" } }) });
    await convidarAIndicar(db as never, { organizationId: ORG, contactId: "c1", canalId: "ch1" });
    expect(enviarTextoNoCanal).not.toHaveBeenCalled();
  });
});
