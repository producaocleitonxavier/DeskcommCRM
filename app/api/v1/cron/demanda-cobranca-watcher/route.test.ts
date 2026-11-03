/**
 * O vigia da cobrança abre UM alerta por org, não duplica, ignora o que ainda
 * está no prazo e limpa o alerta quando a org zera. E NUNCA envia nada — só
 * escreve em pol_alerts (não há tabela de envio no mock, de propósito).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({ env: { INTERNAL_SECRET: "segredo", INTERNAL_CRON_SECRET: "" } }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";

const ORG = "11111111-1111-4111-8111-111111111111";
const dAtras = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

interface Cap {
  inserts: Array<Record<string, unknown>>;
  updates: Array<Record<string, unknown>>;
}
const vazio = (): Cap => ({ inserts: [], updates: [] });

function admin(
  demandasRows: Array<Record<string, unknown>>,
  existingOpenId: string | null,
  postScanOpen: Array<{ id: string; organization_id: string }>,
  cap: Cap,
  paradasRows: Array<{ id: string }> = [],
) {
  return {
    from(tabela: string) {
      if (tabela === "organizations") {
        // idsDeOrgsParadas: .select("id").neq("status", "active")
        return { select: () => ({ neq: async () => ({ data: paradasRows, error: null }) }) };
      }
      if (tabela === "demandas") {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          not: () => chain,
          limit: async () => ({ data: demandasRows, error: null }),
        };
        return chain;
      }
      // pol_alerts: serve tanto o check por-org (.maybeSingle) quanto a
      // varredura de limpeza (await direto via then), além de insert/update.
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: existingOpenId ? { id: existingOpenId } : null }),
        then: (r: (v: unknown) => unknown) => Promise.resolve({ data: postScanOpen }).then(r),
        insert: async (linha: Record<string, unknown>) => {
          cap.inserts.push(linha);
          return { error: null };
        },
        update: (patch: Record<string, unknown>) => {
          cap.updates.push(patch);
          const u: Record<string, unknown> = { eq: () => u, then: (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r) };
          return u;
        },
      };
      return chain;
    },
  };
}

const req = () => new NextRequest("http://localhost/x", { headers: { authorization: "Bearer segredo" } });
const demanda = (over: Record<string, unknown> = {}) => ({
  organization_id: ORG,
  pol_orgao_destino: "COPASA",
  estado: "em_atendimento",
  aberta_em: dAtras(60),
  pol_prazo_dias: 30,
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("demanda-cobranca-watcher", () => {
  it("org com demanda atrasada e sem resposta → abre UM alerta (custom/high) na Central", async () => {
    const cap = vazio();
    vi.mocked(createAdminClient).mockReturnValue(admin([demanda()], null, [], cap) as never);

    const { POST } = await import("./route");
    const body = (await (await POST(req())).json()) as { data: Record<string, number> };

    expect(body.data).toMatchObject({ orgs_alertadas: 1 });
    expect(cap.inserts).toHaveLength(1);
    expect(cap.inserts[0]).toMatchObject({
      organization_id: ORG,
      alert_type: "custom",
      severity: "high",
      source_type: "demanda_cobranca",
      status: "open",
    });
    expect(String(cap.inserts[0]!.title)).toContain("atrasada");
    // A regra de ouro aparece no próprio aviso: o envio é humano.
    expect(String(cap.inserts[0]!.description)).toContain("o envio é sempre feito por você");
  });

  it("idempotente: já existe alerta aberto → ATUALIZA, não duplica", async () => {
    const cap = vazio();
    vi.mocked(createAdminClient).mockReturnValue(
      admin([demanda()], "al-1", [{ id: "al-1", organization_id: ORG }], cap) as never,
    );

    const { POST } = await import("./route");
    await POST(req());

    expect(cap.inserts).toHaveLength(0);
    expect(cap.updates).toHaveLength(1);
    expect(cap.updates[0]).toMatchObject({ severity: "high" });
    expect(String(cap.updates[0]!.title)).toContain("atrasada");
    // Não resolveu: a org ainda tem o que cobrar.
    expect(cap.updates[0]).not.toMatchObject({ status: "resolved" });
  });

  it("ANTI-TAUTOLOGIA: sem resposta mas DENTRO do prazo NÃO gera alerta", async () => {
    const cap = vazio();
    // Recém-aberta: prazo 30 dias ainda não venceu.
    vi.mocked(createAdminClient).mockReturnValue(
      admin([demanda({ aberta_em: new Date().toISOString() })], null, [], cap) as never,
    );

    const { POST } = await import("./route");
    const body = (await (await POST(req())).json()) as { data: Record<string, number> };

    expect(body.data).toMatchObject({ orgs_alertadas: 0 });
    expect(cap.inserts).toHaveLength(0);
    expect(cap.updates).toHaveLength(0);
  });

  it("org zerou (nada atrasado) mas tinha alerta aberto → vai a 'resolved' sozinho", async () => {
    const cap = vazio();
    vi.mocked(createAdminClient).mockReturnValue(
      admin([], null, [{ id: "al-x", organization_id: ORG }], cap) as never,
    );

    const { POST } = await import("./route");
    const body = (await (await POST(req())).json()) as { data: Record<string, number> };

    expect(body.data).toMatchObject({ orgs_limpas: 1 });
    expect(cap.inserts).toHaveLength(0);
    expect(cap.updates).toHaveLength(1);
    expect(cap.updates[0]).toMatchObject({ status: "resolved" });
  });

  it("org SUSPENSA não é cutucada — mesmo com demanda atrasada sem resposta", async () => {
    const cap = vazio();
    vi.mocked(createAdminClient).mockReturnValue(
      admin([demanda()], null, [], cap, [{ id: ORG }]) as never, // ORG está parada
    );

    const { POST } = await import("./route");
    const body = (await (await POST(req())).json()) as { data: Record<string, number> };

    expect(body.data).toMatchObject({ orgs_alertadas: 0 });
    expect(cap.inserts).toHaveLength(0);
    expect(cap.updates).toHaveLength(0);
  });

  it("rodada sem efeito (nada a alertar, nada a limpar) não audita", async () => {
    vi.mocked(createAdminClient).mockReturnValue(admin([], null, [], vazio()) as never);
    const { POST } = await import("./route");
    await POST(req());
    expect(audit).not.toHaveBeenCalled();
  });

  it("sem o segredo, 403 e não lê nada", async () => {
    vi.mocked(createAdminClient).mockReturnValue(admin([], null, [], vazio()) as never);
    const { POST } = await import("./route");
    expect((await POST(new NextRequest("http://localhost/x"))).status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
