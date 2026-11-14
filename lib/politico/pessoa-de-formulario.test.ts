import { describe, expect, it } from "vitest";

import { garantirPessoaDoMandato, origemDoFormulario } from "./pessoa-de-formulario";

type Resposta = { data?: unknown; error?: { code?: string } | null };

/** Cliente de mentira: responde por tabela e guarda o que foi inserido. */
function clienteFalso(gabinete: Resposta, insert: Resposta) {
  const inseridos: Record<string, unknown>[] = [];
  const cliente = {
    from(tabela: string) {
      if (tabela === "pol_gabinete_config") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => gabinete }) }) };
      }
      return {
        insert: async (linha: Record<string, unknown>) => {
          inseridos.push(linha);
          return insert;
        },
      };
    },
  };
  return { cliente: cliente as never, inseridos };
}

describe("cadastro do formulário do site vira pessoa do mandato", () => {
  it("a origem diz de qual formulário veio", () => {
    expect(origemDoFormulario("  Abaixo-assinado   do bairro ")).toBe("Formulário do site: Abaixo-assinado do bairro");
    expect(origemDoFormulario(null)).toBe("Formulário do site");
  });

  it("gabinete: cria a pessoa como Novo contato, na organização da FONTE", async () => {
    const { cliente, inseridos } = clienteFalso({ data: { organization_id: "org-1" } }, { error: null });
    expect(await garantirPessoaDoMandato(cliente, "org-1", "contato-1", "LP da praça")).toBe("criada");
    expect(inseridos[0]).toMatchObject({ organization_id: "org-1", contact_id: "contato-1", support_level: "novo_cadastro", temperature: "frio", consent_origin: "Formulário do site: LP da praça" });
    // preencher formulário não é consentir: o carimbo de consentimento não é gravado
    expect(inseridos[0]).not.toHaveProperty("consent_at");
  });

  it("quem já é pessoa da base não é mexido", async () => {
    const { cliente } = clienteFalso({ data: { organization_id: "org-1" } }, { error: { code: "23505" } });
    expect(await garantirPessoaDoMandato(cliente, "org-1", "contato-1", "LP")).toBe("ja_existia");
  });

  it("organização que não é gabinete não ganha pessoa nenhuma", async () => {
    const { cliente, inseridos } = clienteFalso({ data: null }, { error: null });
    expect(await garantirPessoaDoMandato(cliente, "org-2", "contato-1", "LP")).toBe("nao_e_gabinete");
    expect(inseridos).toHaveLength(0);
  });

  it("erro de banco nunca lança (a rota de captação não pode cair)", async () => {
    const { cliente } = clienteFalso({ data: null, error: { code: "XX000" } }, { error: null });
    expect(await garantirPessoaDoMandato(cliente, "org-1", "contato-1", "LP")).toBe("erro");
    const quebra = { from() { throw new Error("rede"); } } as never;
    expect(await garantirPessoaDoMandato(quebra, "org-1", "contato-1", "LP")).toBe("erro");
  });
});
