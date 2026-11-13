import { describe, expect, it } from "vitest";

import { PERFIS_DE_ACESSO } from "@/lib/navigation/perfis";

import { PORTAS_DA_AREA_DA_API, areaDaApi, decidirApiDoPerfil } from "./perfil-da-api";

const rua = new Set<string>(PERFIS_DE_ACESSO.find((p) => p.chave === "rua")!.destinos as string[]);
const gabinete = new Set<string>(PERFIS_DE_ACESSO.find((p) => p.chave === "gabinete")!.destinos as string[]);

describe("perfil de menu nas consultas ao servidor", () => {
  it("assessor de rua não lê contatos, conversas, envios nem quadros", () => {
    for (const rota of [
      "/api/v1/conversations",
      "/api/v1/%63onversations",
      "/api/v1/ig-webhook-tokens",
      "/api/v1/pol-call-queue",
      "/api/v1/messages",
      "/api/v1/campaigns",
      "/api/v1/leads",
      "/api/v1/tasks",
      "/api/v1/pol-liderancas",
      "/api/v1/pol-emendas",
      "/api/v1/ai/cases",
      "/api/v1/reports/summary",
    ]) {
      expect(decidirApiDoPerfil(rota, "agent", true, rua), rota).toBe("fora_do_perfil");
    }
  });

  it("assessor de rua segue usando o que as telas dele chamam (medido na homologação)", () => {
    for (const rota of [
      "/api/v1/agenda/agendamentos",
      "/api/v1/agenda/horarios-livres",
      "/api/v1/agenda/pessoas",
      "/api/v1/auth/interface",
      "/api/v1/auth/realtime-token",
      "/api/v1/system/version",
      "/api/v1/tags/cores",
      "/api/v1/voice/calls",
      "/api/v1/attendants/presence",
      "/api/v1/demandas",
      "/api/v1/pol-leads",
      // salvar uma pessoa em Pessoas › Novo / Editar
      "/api/v1/contacts",
      "/api/v1/contacts/123",
    ]) {
      expect(decidirApiDoPerfil(rota, "agent", true, rua), rota).toBe("ok");
    }
  });

  it("assessor de gabinete abre lideranças e emendas, mas não conversas nem envios", () => {
    expect(decidirApiDoPerfil("/api/v1/pol-liderancas", "agent", true, gabinete)).toBe("ok");
    expect(decidirApiDoPerfil("/api/v1/pol-emendas/1", "agent", true, gabinete)).toBe("ok");
    expect(decidirApiDoPerfil("/api/v1/conversations", "agent", true, gabinete)).toBe("fora_do_perfil");
    expect(decidirApiDoPerfil("/api/v1/campaigns", "agent", true, gabinete)).toBe("fora_do_perfil");
  });

  it("quem ganhou a porta de Conversas abre também a ficha, as etapas e as tarefas da pessoa", () => {
    const comInbox = new Set([...gabinete, "/app/inbox"]);
    for (const rota of ["/api/v1/conversations", "/api/v1/messages", "/api/v1/contacts/1", "/api/v1/leads", "/api/v1/tasks", "/api/v1/message-templates", "/api/v1/ai/cases"]) {
      expect(decidirApiDoPerfil(rota, "agent", true, comInbox), rota).toBe("ok");
    }
    expect(decidirApiDoPerfil("/api/v1/campaigns", "agent", true, comInbox)).toBe("fora_do_perfil");
  });

  it("controle negativo: gestor, administrador e quem tem o menu completo não mudam", () => {
    expect(decidirApiDoPerfil("/api/v1/contacts", "manager", true, rua)).toBe("ok");
    expect(decidirApiDoPerfil("/api/v1/contacts", "admin", true, new Set())).toBe("ok");
    expect(decidirApiDoPerfil("/api/v1/contacts", "agent", false, new Set())).toBe("ok");
    expect(decidirApiDoPerfil("/api/v1/contacts", "viewer", false, new Set())).toBe("ok");
  });

  it("perfil restrito sem endereço conhecido falha fechado; fora da API quem decide é a tela", () => {
    expect(decidirApiDoPerfil(null, "agent", true, rua)).toBe("fora_do_perfil");
    expect(decidirApiDoPerfil("/app/politico/demandas", "agent", true, rua)).toBe("ok");
  });

  it("rota fora do mapa por área usa as portas declaradas por ela", () => {
    expect(decidirApiDoPerfil("/api/v1/politico/liderancas/1/foto", "agent", true, rua, ["/app/politico/liderancas"])).toBe("fora_do_perfil");
    expect(decidirApiDoPerfil("/api/v1/politico/demandas/1/anexos", "agent", true, rua, ["/app/politico/demandas"])).toBe("ok");
    expect(decidirApiDoPerfil(null, "agent", true, gabinete, ["/app/politico/liderancas"])).toBe("ok");
  });

  it("a área é o primeiro trecho depois de /api/v1/", () => {
    expect(areaDaApi("/api/v1/contacts/abc/merge")).toBe("contacts");
    expect(areaDaApi("/api/v1/pol-leads")).toBe("pol-leads");
    expect(areaDaApi("/api/v1/%63ontacts")).toBe("contacts");
    expect(areaDaApi("/api/v1/Contacts")).toBe("contacts");
    expect(areaDaApi("/api/v2/contacts")).toBeNull();
    expect(areaDaApi("/app/contacts")).toBeNull();
  });

  it("toda área mapeada pede ao menos uma porta", () => {
    for (const [area, portas] of Object.entries(PORTAS_DA_AREA_DA_API)) {
      expect(portas.length, area).toBeGreaterThan(0);
      for (const p of portas) expect(p.startsWith("/app/"), `${area}: ${p}`).toBe(true);
    }
  });
});
