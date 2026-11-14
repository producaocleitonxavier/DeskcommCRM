import { describe, expect, it } from "vitest";
import {
  PADRAO_DO_OFICIO,
  dataDaPraxe,
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

  it("local e protocolo entram quando o gabinete preencheu", () => {
    const p = montarPedidoDoOficio({ assunto: "Poda", local: "Rua A, nº 1, Bairro B, CEP 30000-000", protocolo: "31.0001/2026-01" });
    expect(p).toContain("Local da ocorrência (copie exatamente): Rua A, nº 1, Bairro B, CEP 30000-000");
    expect(p).toContain("Protocolo já aberto no órgão (copie exatamente): 31.0001/2026-01");
    expect(montarPedidoDoOficio({ assunto: "Poda" })).not.toContain("Protocolo");
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

  it("data como a praxe escreve, no horário de Brasília", () => {
    expect(dataDaPraxe(new Date("2026-11-24T14:00:00Z"))).toBe("24 de novembro de 2026, terça-feira, às 11 horas");
    expect(dataDaPraxe(new Date("2026-11-04T13:30:00Z"))).toBe("04 de novembro de 2026, quarta-feira, às 10h30");
  });

  it("limpa a marcação e normaliza os marcadores", () => {
    const sujo = "## Ofício\n\nSenhor Secretário,\n\n\n\n- **Solicitação de poda** na Rua A.\n* outro item\n• já certo\n\nRespeitosamente,  ";
    expect(limparTextoOficial(sujo)).toBe(
      "Ofício\n\nSenhor Secretário,\n\n• Solicitação de poda na Rua A.\n• outro item\n• já certo\n\nRespeitosamente,",
    );
  });
});
