import { describe, expect, it } from "vitest";
import {
  PADRAO_DO_OFICIO,
  instrucoesDoRequerimento,
  limparTextoOficial,
  montarPedidoDoOficio,
  montarPedidoDoRequerimento,
} from "./redacao-oficial";

describe("redação oficial do gabinete", () => {
  it("o padrão do ofício traz a abertura, o fecho e a proibição de inventar", () => {
    expect(PADRAO_DO_OFICIO).toContain("Cumprimentando-o respeitosamente");
    expect(PADRAO_DO_OFICIO).toContain("renovar protestos de estima e consideração");
    expect(PADRAO_DO_OFICIO).toContain("Respeitosamente,");
    expect(PADRAO_DO_OFICIO).toContain("NUNCA invente");
    expect(PADRAO_DO_OFICIO).toContain("nunca promete resultado");
  });

  it("o padrão do produto não carrega nome de cliente, cidade ou autoridade", () => {
    const tudo = PADRAO_DO_OFICIO + instrucoesDoRequerimento("visita_tecnica") + instrucoesDoRequerimento("audiencia_publica");
    for (const proibido of ["Cleiton", "Belo Horizonte", "Catunda", "União Brasil", "SUDECAP", "art. 48"]) {
      expect(tudo).not.toContain(proibido);
    }
  });

  it("o pedido do ofício só leva as linhas que têm dado", () => {
    const p = montarPedidoDoOficio({ demandante: "Maria", assunto: "Poda de árvore", cidade: "Contagem" });
    expect(p).toContain("Cidadão demandante: Maria");
    expect(p).toContain("Cidade do gabinete: Contagem");
    expect(p).not.toContain("Bairro do cidadão");
    expect(p).not.toContain("O que o gabinete registrou");
  });

  it("sem cidadão, avisa que a demanda é do gabinete", () => {
    expect(montarPedidoDoOficio({ assunto: "Iluminação da praça" })).toContain("(nenhum — demanda do próprio gabinete)");
  });

  it("relatos entram numerados, sem quebra de linha, e só os 8 mais recentes", () => {
    const relatos = Array.from({ length: 10 }, (_, i) => `relato\n${i}`);
    const p = montarPedidoDoOficio({ assunto: "x", relatos });
    expect(p).toContain("1. relato 2");
    expect(p).toContain("8. relato 9");
    expect(p).not.toContain("relato 1\n");
  });

  it("requerimento: cada tipo tem a sua estrutura", () => {
    expect(instrucoesDoRequerimento("visita_tecnica")).toContain("ponto de encontro");
    expect(instrucoesDoRequerimento("visita_tecnica")).not.toContain("nota técnica");
    expect(instrucoesDoRequerimento("audiencia_publica")).toContain("nota técnica");
  });

  it("pedido do requerimento lista os convidados informados", () => {
    const p = montarPedidoDoRequerimento({ tipo: "visita_tecnica", assunto: "Erosão", convidados: ["Defesa Civil", " "] });
    expect(p).toContain("visita técnica");
    expect(p).toContain("- Defesa Civil");
    expect(p).not.toContain("- \n");
  });

  it("limpa a marcação e normaliza os marcadores", () => {
    const sujo = "## Ofício\n\nSenhor Secretário,\n\n\n\n- **Solicitação de poda** na Rua A.\n* outro item\n• já certo\n\nRespeitosamente,  ";
    expect(limparTextoOficial(sujo)).toBe(
      "Ofício\n\nSenhor Secretário,\n\n• Solicitação de poda na Rua A.\n• outro item\n• já certo\n\nRespeitosamente,",
    );
  });
});
