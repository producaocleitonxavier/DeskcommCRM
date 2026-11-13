import { describe, expect, it } from "vitest";

import { NAV_CATALOG } from "./catalogo";
import { AREAS_DO_GABINETE, ehGabinete, enderecosCobertos, portaDaTela, portasDoGabinete } from "./menu-do-gabinete";
import { PERFIS_DE_ACESSO } from "./perfis";

const CATALOGO = new Set<string>(NAV_CATALOG.map((d) => d.href));
const TUDO = new Set<string>([...CATALOGO]);
const perfil = (chave: "rua" | "gabinete") => new Set<string>(PERFIS_DE_ACESSO.find((p) => p.chave === chave)!.destinos ?? []);

describe("menu do gabinete — enxuga sem perder tela", () => {
  it("fica em 19 portas no menu lateral", () => {
    expect(AREAS_DO_GABINETE).toHaveLength(19);
    expect(portasDoGabinete(TUDO)).toHaveLength(19);
  });

  it("toda aba aponta para uma tela que existe no catálogo (ou acompanha uma que existe)", () => {
    for (const area of AREAS_DO_GABINETE) {
      for (const aba of area.abas) {
        expect(CATALOGO.has(aba.seVe ?? aba.href), `${area.label} › ${aba.label} (${aba.href})`).toBe(true);
      }
    }
  });

  it("nenhuma tela aparece em duas áreas", () => {
    const todos = enderecosCobertos();
    expect(new Set(todos).size).toBe(todos.length);
  });

  it("NADA SE PERDE: as telas de uso diário do menu antigo têm porta ou aba", () => {
    const cobertos = new Set(enderecosCobertos());
    const antigas = [
      "/app/politico", "/app/politico/leads", "/app/politico/importar", "/app/politico/funil", "/app/agenda",
      "/app/politico/demandas", "/app/politico/visitas", "/app/politico/oficios", "/app/politico/liderancas",
      "/app/politico/projetos-lei", "/app/politico/emendas", "/app/politico/obras", "/app/politico/locais",
      "/app/politico/nutricao", "/app/politico/follow-up-simples", "/app/inbox", "/app/radar", "/app/templates",
      "/app/ai/cases", "/app/politico/raio-x", "/app/politico/comparativo", "/app/politico/radar-zonal",
      "/app/politico/cadeiras", "/app/politico/boletim", "/app/politico/pesquisas", "/app/politico/briefing",
      "/app/politico/social", "/app/politico/narrativas", "/app/campaigns", "/app/captacao-qr",
      "/app/politico/grupos-origem", "/app/politico/kanban", "/app/politico/multiplicadores", "/app/contacts",
      "/app/tasks", "/app/politico/materiais", "/app/ai/followups", "/app/instagram", "/app/activities",
    ];
    for (const href of antigas) expect(cobertos.has(href), href).toBe(true);
  });

  it("assessor de RUA vê só as portas dele, com o nome certo", () => {
    const portas = portasDoGabinete(perfil("rua"));
    expect(portas.map((p) => p.label)).toEqual(["Hoje", "Pessoas", "Agenda", "Demandas", "Visitas Técnicas", "Obras & Fiscalização"]);
    // "Emendas e Obras" vira "Obras & Fiscalização" para quem só enxerga Obras.
    expect(portas.find((p) => p.label === "Obras & Fiscalização")!.href).toBe("/app/politico/obras");
    // Agenda dele tem Agenda + Locais & Eventos, sem Tarefas.
    expect(portas.find((p) => p.label === "Agenda")!.abas.map((a) => a.label)).toEqual(["Agenda", "Locais & Eventos"]);
  });

  it("controle negativo: a camada nunca mostra o que o usuário não enxerga", () => {
    for (const chave of ["rua", "gabinete"] as const) {
      const visiveis = perfil(chave);
      for (const porta of portasDoGabinete(visiveis)) {
        for (const aba of porta.abas) expect(visiveis.has(aba.seVe ?? aba.href), `${chave}: ${aba.href}`).toBe(true);
      }
    }
    expect(portasDoGabinete(new Set())).toEqual([]);
  });

  it("só é gabinete quem enxerga a Hoje do mandato", () => {
    expect(ehGabinete(new Set(["/app/politico"]))).toBe(true);
    expect(ehGabinete(new Set(["/app/inbox", "/app/contacts"]))).toBe(false);
  });

  it("a porta acesa é a dona da tela, inclusive numa aba e num detalhe", () => {
    const portas = portasDoGabinete(TUDO);
    expect(portaDaTela("/app/templates", portas)?.porta.label).toBe("Conversas");
    expect(portaDaTela("/app/politico/obras", portas)?.porta.label).toBe("Emendas e Obras");
    expect(portaDaTela("/app/politico/demandas/123", portas)?.porta.label).toBe("Demandas");
    expect(portaDaTela("/app/politico/multiplicadores", portas)?.aba.label).toBe("Multiplicadores");
  });

  it("controle negativo: 'Hoje' não acende nas outras telas do mandato; tela de fora não acende nada", () => {
    const portas = portasDoGabinete(TUDO);
    expect(portaDaTela("/app/politico", portas)?.porta.label).toBe("Hoje");
    expect(portaDaTela("/app/politico/identidade", portas)).toBeNull();
    expect(portaDaTela("/app/settings", portas)).toBeNull();
  });
});
