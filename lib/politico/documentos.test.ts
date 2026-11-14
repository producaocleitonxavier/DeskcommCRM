import { describe, expect, it } from "vitest";

import {
  FUNCOES,
  MODELOS_DE_CASA,
  diasParaOPrazo,
  normalizarTipos,
  prepararDocumento,
  situacoesDaFuncao,
  tiposDeSettings,
  tiposLigados,
  tituloDoDocumento,
} from "./documentos";

describe("documentos do gabinete — tipos por gabinete", () => {
  it("sem configuração vale o padrão: só o requerimento de comissão ligado", () => {
    const t = tiposDeSettings({ gabinete: { modo_campanha: false } });
    expect(t.map((x) => x.funcao).sort()).toEqual([...FUNCOES].sort());
    expect(tiposLigados(t).map((x) => x.rotulo)).toEqual(["Requerimento de comissão"]);
    expect(tiposDeSettings(null)).toEqual(t);
  });

  it("cada modelo de Casa traz as quatro funções, uma vez cada", () => {
    for (const m of Object.values(MODELOS_DE_CASA)) {
      expect(m.tipos.map((t) => t.funcao).sort()).toEqual([...FUNCOES].sort());
      expect(m.tipos.some((t) => t.ligado)).toBe(true);
    }
  });

  it("configuração guardada: respeita rótulo e ligado; o que falta entra desligado", () => {
    const t = tiposDeSettings({ gabinete: { documentos: { tipos: [{ funcao: "providencia", rotulo: "  Indicação   legislativa ", ligado: true }] } } });
    expect(t[0]).toEqual({ funcao: "providencia", rotulo: "Indicação legislativa", ligado: true });
    expect(t).toHaveLength(4);
    expect(tiposLigados(t)).toHaveLength(1); // o requerimento de comissão NÃO volta ligado sozinho
  });

  it("lixo na configuração não derruba: função desconhecida, repetida, rótulo vazio ou gigante", () => {
    const t = normalizarTipos([
      { funcao: "inventada", rotulo: "X", ligado: true },
      { funcao: "manifestacao", rotulo: "", ligado: "sim" },
      { funcao: "manifestacao", rotulo: "Repetida", ligado: true },
      { funcao: "informacao", rotulo: "a".repeat(500), ligado: true },
      null,
      7,
    ]);
    expect(t).toHaveLength(4);
    expect(t.find((x) => x.funcao === "manifestacao")).toEqual({ funcao: "manifestacao", rotulo: "Moção", ligado: false });
    expect(t.find((x) => x.funcao === "informacao")!.rotulo).toHaveLength(60);
  });
});

describe("documentos do gabinete — conferência antes de gravar", () => {
  const tipos = normalizarTipos([
    { funcao: "pedido_comissao", rotulo: "Requerimento de comissão", ligado: true },
    { funcao: "providencia", rotulo: "Indicação", ligado: false },
  ]);

  it("documento bom passa, com o rótulo DO GABINETE (não o que veio do formulário)", () => {
    const r = prepararDocumento(
      { funcao: "pedido_comissao", rotulo: "Outro nome", subtipo: "visita_tecnica", assunto: "  Buraco na   rua A ", corpo: "Senhor Presidente,\r\n\r\nRequeiro.", situacao: "protocolado", numero: " 123/2026 ", protocolado_em: "2026-11-14", prazo_em: "14/12/2026" },
      tipos,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc).toMatchObject({ rotulo: "Requerimento de comissão", assunto: "Buraco na rua A", corpo: "Senhor Presidente,\n\nRequeiro.", situacao: "protocolado", numero: "123/2026", protocolado_em: "2026-11-14", prazo_em: null });
  });

  it("tipo desligado, função inventada, sem assunto e texto gigante são recusados", () => {
    expect(prepararDocumento({ funcao: "providencia", assunto: "x" }, tipos)).toMatchObject({ ok: false });
    expect(prepararDocumento({ funcao: "qualquer", assunto: "x" }, tipos)).toMatchObject({ ok: false });
    expect(prepararDocumento({ funcao: "pedido_comissao", assunto: "   " }, tipos)).toMatchObject({ ok: false });
    expect(prepararDocumento({ funcao: "pedido_comissao", assunto: "x", corpo: "a".repeat(12001) }, tipos)).toMatchObject({ ok: false });
    expect(prepararDocumento(null, tipos)).toMatchObject({ ok: false });
  });

  it("situação: nova nasce rascunho; inválida é erro; na edição o padrão é a atual", () => {
    const novo = prepararDocumento({ funcao: "pedido_comissao", assunto: "x" }, tipos);
    expect(novo.ok && novo.doc.situacao).toBe("rascunho");
    expect(prepararDocumento({ funcao: "pedido_comissao", assunto: "x", situacao: "respondido" }, tipos)).toMatchObject({ ok: false });
    expect(prepararDocumento({ funcao: "pedido_comissao", assunto: "x", situacao: "qualquer" }, tipos)).toMatchObject({ ok: false });
    // edição que não manda a situação NÃO rebaixa o documento
    const semSituacao = prepararDocumento({ funcao: "pedido_comissao", assunto: "x" }, tipos, "protocolado");
    expect(semSituacao.ok && semSituacao.doc.situacao).toBe("protocolado");
    expect(situacoesDaFuncao("informacao")).toContain("respondido");
  });

  it("documento que saiu de rascunho não volta (senão dava para apagar um protocolado)", () => {
    expect(prepararDocumento({ funcao: "pedido_comissao", assunto: "x", situacao: "rascunho" }, tipos, "protocolado")).toMatchObject({ ok: false });
    const avanca = prepararDocumento({ funcao: "pedido_comissao", assunto: "x", situacao: "aprovado" }, tipos, "protocolado");
    expect(avanca.ok && avanca.doc.situacao).toBe("aprovado");
    const segue = prepararDocumento({ funcao: "pedido_comissao", assunto: "x", situacao: "rascunho" }, tipos, "rascunho");
    expect(segue.ok && segue.doc.situacao).toBe("rascunho");
  });

  it("subtipo só existe em pedido a comissão; data que não existe é descartada", () => {
    const ind = normalizarTipos([{ funcao: "providencia", rotulo: "Indicação", ligado: true }]);
    const r = prepararDocumento({ funcao: "providencia", assunto: "x", subtipo: "visita_tecnica", protocolado_em: "2026-02-31", prazo_em: "2026-02-28" }, ind);
    expect(r.ok && r.doc.subtipo).toBeNull();
    expect(r.ok && r.doc.protocolado_em).toBeNull();
    expect(r.ok && r.doc.prazo_em).toBe("2026-02-28");
  });

  it("título do PDF", () => {
    expect(tituloDoDocumento("Requerimento de comissão", "visita_tecnica")).toBe("REQUERIMENTO DE VISITA TÉCNICA");
    expect(tituloDoDocumento("Requerimento de comissão", "audiencia_publica")).toBe("REQUERIMENTO DE AUDIÊNCIA PÚBLICA");
    expect(tituloDoDocumento("Indicação", null)).toBe("INDICAÇÃO");
    expect(tituloDoDocumento("Requerimento de comissão", "seminário")).toBe("REQUERIMENTO DE COMISSÃO");
  });

  it("prazo: conta em dias de Brasília e some quando o documento já fechou", () => {
    const hoje = new Date("2026-11-14T15:00:00-03:00");
    expect(diasParaOPrazo("2026-11-14", "protocolado", hoje)).toBe(0);
    expect(diasParaOPrazo("2026-12-14", "protocolado", hoje)).toBe(30);
    expect(diasParaOPrazo("2026-11-10", "aprovado", hoje)).toBe(-4);
    expect(diasParaOPrazo("2026-11-10", "respondido", hoje)).toBeNull();
    expect(diasParaOPrazo(null, "protocolado", hoje)).toBeNull();
    // 23h de Brasília ainda é o mesmo dia (o servidor roda em UTC)
    expect(diasParaOPrazo("2026-11-14", "protocolado", new Date("2026-11-15T02:00:00Z"))).toBe(0);
  });
});

import { resumoDaMudancaDeTipos } from "./documentos";

describe("histórico dos tipos de documento", () => {
  const base = [
    { funcao: "pedido_comissao", rotulo: "Requerimento de comissão", ligado: true },
    { funcao: "providencia", rotulo: "Indicação", ligado: false },
  ];
  it("descreve ligar, desligar e renomear", () => {
    const depois = [
      { funcao: "pedido_comissao", rotulo: "Pedido à comissão", ligado: true },
      { funcao: "providencia", rotulo: "Indicação", ligado: true },
    ];
    expect(resumoDaMudancaDeTipos(base, depois)).toEqual(["Renomeou Requerimento de comissão para Pedido à comissão", "Ligou Indicação"]);
    expect(resumoDaMudancaDeTipos(depois, base)).toContain("Desligou Indicação");
  });
  it("nada mudou = lista vazia; lixo não derruba", () => {
    expect(resumoDaMudancaDeTipos(base, base)).toEqual([]);
    expect(resumoDaMudancaDeTipos(null, "x")).toEqual([]);
  });
});
