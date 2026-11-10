import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { linhasDeModelosPoliticos, nichoDaOrg } from "./semear-politico";
import { MODELOS_DE_POLITICO } from "./modelos/politico";
import { triggerConfigSchema } from "./api-schemas";
import { flowGraphSchema } from "./graph-schema";

const ORG = "11111111-1111-4111-8111-111111111111";

/** Fake mínimo da cadeia `from(...).select(...).eq(...).maybeSingle()`. */
function dbComGabineteConfig(temConfig: boolean): SupabaseClient {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: temConfig ? { organization_id: ORG } : null,
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { from } as unknown as SupabaseClient;
}

describe("linhasDeModelosPoliticos", () => {
  const linhas = linhasDeModelosPoliticos(ORG);

  it("monta exatamente os follow-ups do catálogo do gabinete", () => {
    expect(linhas).toHaveLength(2);
    expect(linhas).toHaveLength(MODELOS_DE_POLITICO.length);
  });

  it("usa os nomes dos modelos (chave única org+name)", () => {
    expect(linhas.map((l) => l.name).sort()).toEqual(
      MODELOS_DE_POLITICO.map((m) => m.nome).sort(),
    );
  });

  it("carimba a org em toda linha", () => {
    for (const l of linhas) expect(l.organization_id).toBe(ORG);
  });

  it("nasce com handoff 'pause' (a conversa volta pra quem atende)", () => {
    for (const l of linhas) expect(l.handoff_policy).toBe("pause");
  });

  it("grava um trigger_config VÁLIDO (não diverge do schema da rota)", () => {
    for (const l of linhas) {
      expect(() => triggerConfigSchema.parse(l.trigger_config)).not.toThrow();
    }
  });

  it("leva o grafo com nós (texto e prazos), não um grafo vazio", () => {
    for (const l of linhas) {
      expect(l.draft_graph.nodes.length).toBeGreaterThan(0);
    }
  });

  it("grava o grafo CANÔNICO (parse idempotente) — senão o editor abre 'não salvo' e quebra", () => {
    // O grafo gravado tem de ser igual ao seu próprio parse: é o que a rota
    // `from-model` faz. Se gravássemos o cru, o schema preencheria defaults no
    // load (ex.: target no match_reply) e a tela nasceria dirty + canvas vazio.
    for (const l of linhas) {
      expect(flowGraphSchema.parse(l.draft_graph)).toEqual(l.draft_graph);
    }
  });
});

describe("nichoDaOrg", () => {
  it("é 'politico' quando a org tem identidade do mandato (pol_gabinete_config)", async () => {
    expect(await nichoDaOrg(dbComGabineteConfig(true), ORG)).toBe("politico");
  });

  it("cai em 'clinica' (padrão de origem) sem pol_gabinete_config", async () => {
    expect(await nichoDaOrg(dbComGabineteConfig(false), ORG)).toBe("clinica");
  });
});
