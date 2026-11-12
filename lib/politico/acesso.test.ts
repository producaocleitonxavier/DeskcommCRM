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
