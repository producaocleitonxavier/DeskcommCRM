import { describe, it, expect } from "vitest";
import { NAV_CATALOG } from "@/lib/navigation/catalogo";
import { destinosDaInterface } from "@/lib/navigation/interface";
import { PERFIS_DE_ACESSO } from "@/lib/navigation/perfis";

const hrefs = new Set(NAV_CATALOG.map((d) => d.href));

describe("PERFIS_DE_ACESSO", () => {
  it("todo destino de todo perfil existe no catálogo", () => {
    for (const p of PERFIS_DE_ACESSO) {
      for (const d of p.destinos ?? []) {
        expect(hrefs.has(d), `${p.chave}: ${d}`).toBe(true);
      }
    }
  });

  it("Assessor de rua (Atendente) vê o campo e NÃO vê o avançado/config", () => {
    const rua = PERFIS_DE_ACESSO.find((p) => p.chave === "rua")!;
    const vis = destinosDaInterface(
      { preset: "completa", destinos: [...rua.destinos!] },
      false,
      "agent",
    ).map((d) => d.href);
    for (const d of ["/app/politico/demandas", "/app/politico/leads", "/app/captacao-qr", "/app/politico/agenda", "/app/politico/liderancas", "/app/politico/locais"]) {
      expect(vis, `rua deveria ver ${d}`).toContain(d);
    }
    for (const d of ["/app/politico/emendas", "/app/politico/projetos-lei", "/app/politico/identidade", "/app/settings/billing", "/app/campaigns", "/app/metrics"]) {
      expect(vis, `rua NÃO deveria ver ${d}`).not.toContain(d);
    }
  });

  it("Assessor de gabinete (Atendente) vê ofícios/emendas/inbox, não config de plataforma", () => {
    const gab = PERFIS_DE_ACESSO.find((p) => p.chave === "gabinete")!;
    const vis = destinosDaInterface(
      { preset: "completa", destinos: [...gab.destinos!] },
      false,
      "agent",
    ).map((d) => d.href);
    for (const d of ["/app/politico/oficios", "/app/politico/emendas", "/app/politico/projetos-lei", "/app/inbox", "/app/ai/cases"]) {
      expect(vis, `gabinete deveria ver ${d}`).toContain(d);
    }
    for (const d of ["/app/settings/billing", "/app/settings/tenant"]) {
      expect(vis, `gabinete NÃO deveria ver ${d}`).not.toContain(d);
    }
  });
});
