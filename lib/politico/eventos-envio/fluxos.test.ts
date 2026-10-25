import { describe, it, expect } from "vitest";

import { flowGraphSchema } from "@/lib/followup/graph-schema";
import { validateFlowForPublish } from "@/lib/followup/validate-publish";
import {
  montarFluxoBoasVindasEbook,
  montarFluxoDripMensal,
  TOQUES_DRIP_PADRAO,
  INTERVALO_DRIP_MS,
} from "./fluxos";

describe("fluxo de boas-vindas + ebook", () => {
  const grafo = montarFluxoBoasVindasEbook({
    ebookTitulo: "Combate ao Bullying",
    ebookUrl: "https://exemplo.org/ebooks/bullying.pdf",
  });

  it("é um grafo válido pelo schema do motor", () => {
    expect(() => flowGraphSchema.parse(grafo)).not.toThrow();
  });

  it("é publicável como fluxo de follow-up", () => {
    const r = validateFlowForPublish(grafo, { surface: "followup" });
    expect(r.ok).toBe(true);
  });

  it("leva o link do ebook embutido no texto (constante, não variável)", () => {
    const corpos = grafo.nodes
      .filter((n) => n.type === "action")
      .map((n) => (n.config as { body: string }).body);
    expect(corpos.some((b) => b.includes("https://exemplo.org/ebooks/bullying.pdf"))).toBe(true);
    expect(corpos.some((b) => b.includes("Combate ao Bullying"))).toBe(true);
  });

  it("nenhum texto usa interpolação (proibida no modo text)", () => {
    const corpos = grafo.nodes
      .filter((n) => n.type === "action")
      .map((n) => (n.config as { body: string }).body);
    for (const b of corpos) expect(b.includes("{{")).toBe(false);
  });

  it("tem um fim de ganho (converted) — o gancho da graduação", () => {
    const fins = grafo.nodes.filter((n) => n.type === "end");
    expect(fins.some((n) => (n.config as { outcome: string }).outcome === "converted")).toBe(true);
  });
});

describe("fluxo de drip mensal", () => {
  const grafo = montarFluxoDripMensal({ toques: [...TOQUES_DRIP_PADRAO] });

  it("é um grafo válido pelo schema do motor", () => {
    expect(() => flowGraphSchema.parse(grafo)).not.toThrow();
  });

  it("é publicável como fluxo de follow-up", () => {
    const r = validateFlowForPublish(grafo, { surface: "followup" });
    expect(r.ok).toBe(true);
  });

  it("toda espera é imune à resposta (a cadência mensal não cancela)", () => {
    const esperas = grafo.nodes.filter((n) => n.type === "wait");
    expect(esperas.length).toBe(TOQUES_DRIP_PADRAO.length);
    for (const e of esperas) {
      const cfg = e.config as { mode: string; immune_to_reply?: boolean; duration_ms: number };
      expect(cfg.mode).toBe("fixed");
      expect(cfg.immune_to_reply).toBe(true);
      expect(cfg.duration_ms).toBe(INTERVALO_DRIP_MS);
    }
  });

  it("manda uma mensagem por toque e termina", () => {
    const acoes = grafo.nodes.filter((n) => n.type === "action");
    expect(acoes.length).toBe(TOQUES_DRIP_PADRAO.length);
    expect(grafo.nodes.some((n) => n.type === "end")).toBe(true);
  });

  it("rejeita drip sem toques", () => {
    expect(() => montarFluxoDripMensal({ toques: [] })).toThrow();
  });
});
