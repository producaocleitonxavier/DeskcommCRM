import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/server", () => ({ requireAuth: vi.fn(), resolveActiveOrg: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { decidirAcessoPolitico, REGRAS_DE_ACESSO_POLITICO, type ModuloPolitico } from "./acesso";
import { PERFIS_DE_ACESSO } from "@/lib/navigation/perfis";

const portas = (chave: "rua" | "gabinete") =>
  new Set<string>(PERFIS_DE_ACESSO.find((p) => p.chave === chave)!.destinos ?? []);
const RUA = portas("rua");
const GABINETE = portas("gabinete");
const VAZIO = new Set<string>();

describe("parede de acesso do módulo político", () => {
  it("viewer não entra em NENHUM módulo, nem com a porta no menu", () => {
    const tudo = new Set(Object.values(REGRAS_DE_ACESSO_POLITICO).flatMap((r) => ("destino" in r ? [r.destino] : [])));
    for (const m of Object.keys(REGRAS_DE_ACESSO_POLITICO) as ModuloPolitico[]) {
      expect(decidirAcessoPolitico(m, "viewer", tudo)).toBe("sem_papel");
    }
  });

  it("assessor de RUA entra no dia-a-dia do campo", () => {
    for (const m of ["hoje", "pessoas", "demandas", "visitas", "obras", "locais", "campo", "vitorias"] as const) {
      expect(decidirAcessoPolitico(m, "agent", RUA)).toBe("ok");
    }
  });

  it("assessor de RUA NÃO entra no que é só do gabinete (mesmo papel, perfil diferente)", () => {
    for (const m of ["oficios", "liderancas", "projetos-lei", "emendas"] as const) {
      expect(decidirAcessoPolitico(m, "agent", RUA)).toBe("fora_do_perfil");
      expect(decidirAcessoPolitico(m, "agent", GABINETE)).toBe("ok");
    }
  });

  it("rua e gabinete NÃO entram em operação nem gestão", () => {
    for (const perfil of [RUA, GABINETE]) {
      for (const m of ["funil", "kanban", "multiplicadores", "grupos-origem"] as const) {
        expect(decidirAcessoPolitico(m, "agent", perfil)).toBe("fora_do_perfil");
      }
      for (const m of ["importar", "materiais", "eventos", "rankings", "identidade", "enriquecer", "follow-up-simples"] as const) {
        expect(decidirAcessoPolitico(m, "agent", perfil)).toBe("sem_papel");
      }
    }
  });

  it("gestor e admin entram em tudo, mesmo com menu personalizado VAZIO", () => {
    for (const m of Object.keys(REGRAS_DE_ACESSO_POLITICO) as ModuloPolitico[]) {
      expect(decidirAcessoPolitico(m, "manager", VAZIO)).toBe("ok");
      expect(decidirAcessoPolitico(m, "admin", VAZIO)).toBe("ok");
    }
  });

  it("administrador da plataforma passa sempre", () => {
    expect(decidirAcessoPolitico("importar", "viewer", VAZIO, true)).toBe("ok");
  });

  it("controle: a porta certa no menu é o que libera (não é tautologia)", () => {
    expect(decidirAcessoPolitico("oficios", "agent", new Set(["/app/politico/oficios"]))).toBe("ok");
    expect(decidirAcessoPolitico("oficios", "agent", new Set(["/app/politico/obras"]))).toBe("fora_do_perfil");
  });
});

import { decidirPortaDoPerfil } from "./acesso";

describe("trava de perfil nas telas do sistema base (varredura de 13/nov)", () => {
  const BASE = ["/app/inbox", "/app/contacts", "/app/campaigns", "/app/kanban", "/app/tasks", "/app/templates", "/app/radar", "/app/ai/cases", "/app/ai/followups", "/app/captacao-qr", "/app/activities"];

  it("assessor de RUA não abre Contatos, Disparos, Conversas… digitando o endereço", () => {
    for (const href of BASE) expect(decidirPortaDoPerfil(href, "agent", RUA), href).toBe("fora_do_perfil");
  });

  it("assessor de GABINETE também não: Conversas é liberada por pessoa, não vem no perfil", () => {
    for (const href of BASE) expect(decidirPortaDoPerfil(href, "agent", GABINETE), href).toBe("fora_do_perfil");
  });

  it("quem teve a porta liberada no perfil entra (ex.: o designado para o atendimento)", () => {
    const designado = new Set([...GABINETE, "/app/inbox", "/app/ai/cases"]);
    expect(decidirPortaDoPerfil("/app/inbox", "agent", designado)).toBe("ok");
    expect(decidirPortaDoPerfil("/app/ai/cases", "agent", designado)).toBe("ok");
    expect(decidirPortaDoPerfil("/app/contacts", "agent", designado)).toBe("fora_do_perfil");
  });

  it("a agenda, que está no perfil de rua, continua abrindo", () => {
    expect(decidirPortaDoPerfil("/app/agenda", "agent", RUA)).toBe("ok");
  });

  it("gestor, administrador e a plataforma passam sempre", () => {
    for (const href of BASE) {
      expect(decidirPortaDoPerfil(href, "manager", VAZIO)).toBe("ok");
      expect(decidirPortaDoPerfil(href, "admin", VAZIO)).toBe("ok");
      expect(decidirPortaDoPerfil(href, "agent", VAZIO, { ehPlataforma: true })).toBe("ok");
    }
  });

  it("tela-índice ('Ver tudo em…') é recusada a quem tem perfil restrito", () => {
    const completo = new Set([...GABINETE, ...BASE]);
    for (const href of ["/app/crm", "/app/ai", "/app/analise"]) {
      expect(decidirPortaDoPerfil(href, "agent", completo, { indice: true, perfilRestrito: true })).toBe("sem_papel");
      // Atendente com o menu inteiro (sem perfil que estreite) continua abrindo o índice.
      expect(decidirPortaDoPerfil(href, "agent", completo, { indice: true })).toBe("ok");
      expect(decidirPortaDoPerfil(href, "manager", VAZIO, { indice: true })).toBe("ok");
    }
  });

  it("a ficha de uma pessoa abre para quem tem a porta 'Pessoas', mas a lista de Contatos não", () => {
    expect(decidirPortaDoPerfil("/app/contacts", "agent", RUA, { ouPorta: "/app/politico/leads" })).toBe("ok");
    expect(decidirPortaDoPerfil("/app/contacts", "agent", RUA)).toBe("fora_do_perfil");
    expect(decidirPortaDoPerfil("/app/contacts", "agent", VAZIO, { ouPorta: "/app/politico/leads" })).toBe("fora_do_perfil");
  });

  it("controle negativo: viewer sem a porta não entra", () => {
    expect(decidirPortaDoPerfil("/app/contacts", "viewer", VAZIO)).toBe("fora_do_perfil");
  });
});
