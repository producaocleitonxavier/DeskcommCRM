"use client";

/**
 * Aba "Requerimentos": lista dos documentos da Casa + janela de escrever + a
 * escolha de quais tipos o gabinete usa (e com que nome).
 *
 * Nada aqui é de uma Casa específica: comissão, órgão e artigo são campos de
 * digitar; o nome de cada tipo é do gabinete.
 */
import { useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, FileDown, FilePlus2, FileText, Loader2, Search, Settings2, Sparkles, Trash2, X } from "lucide-react";

import {
  baixarPdfDoDocumento,
  excluirDocumento,
  redigirDocumento,
  salvarDocumento,
  salvarTiposDeDocumento,
  type DocumentoItem,
  type PainelDeDocumentos,
  type PontoDePartida,
} from "@/app/actions/politico/documentos";
import { CommandHero } from "@/components/politico/command-hero";
import {
  DESCRICAO_DA_FUNCAO,
  MODELOS_DE_CASA,
  ROTULO_DA_SITUACAO,
  SUBTIPOS_DE_COMISSAO,
  diasParaOPrazo,
  situacoesDaFuncao,
  tiposLigados,
  type FuncaoDoDocumento,
  type ModeloDeCasa,
  type SituacaoDoDocumento,
  type TipoDeDocumento,
} from "@/lib/politico/documentos";
import { enterEmLista, lacunasDoTexto } from "@/lib/politico/requerimento-pdf";

type Rascunho = {
  id: string | null;
  funcao: FuncaoDoDocumento;
  rotulo: string;
  subtipo: string;
  assunto: string;
  destinatario: string;
  dispositivo: string;
  orientacao: string;
  corpo: string;
  numero: string;
  situacao: SituacaoDoDocumento;
  protocolado_em: string;
  prazo_em: string;
  demandaId: string | null;
};

const COR_DA_SITUACAO: Record<SituacaoDoDocumento, { fundo: string; texto: string }> = {
  rascunho: { fundo: "#EEF1F5", texto: "#4A5568" },
  protocolado: { fundo: "#E3EEFF", texto: "#1E4FA3" },
  aprovado: { fundo: "#E5F6EA", texto: "#1F7A3D" },
  realizado: { fundo: "#E5F6EA", texto: "#1F7A3D" },
  respondido: { fundo: "#E5F6EA", texto: "#1F7A3D" },
  arquivado: { fundo: "#F1EEF5", texto: "#6B5B7A" },
};

const fmtData = (iso: string) => {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00-03:00` : iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" });
};

function rotuloDoDestinatario(funcao: FuncaoDoDocumento): { campo: string; exemplo: string } {
  if (funcao === "pedido_comissao") return { campo: "Comissão", exemplo: "Ex.: Comissão de Meio Ambiente e Política Urbana" };
  if (funcao === "manifestacao") return { campo: "Para quem é a manifestação", exemplo: "Ex.: Associação de Moradores do Bairro Tal" };
  return { campo: "A quem se pede", exemplo: "Ex.: Prefeito Municipal · Secretaria de Obras" };
}

export default function RequerimentosClient({
  painel,
  partida,
  subtipoInicial,
  avisoDePartida,
}: {
  painel: PainelDeDocumentos;
  partida: PontoDePartida | null;
  subtipoInicial: string | null;
  avisoDePartida: string | null;
}) {
  const router = useRouter();
  /** Tira o `?demanda=` do endereço: recarregar ou voltar não pode abrir OUTRO documento novo da mesma visita. */
  const limparEndereco = () => {
    if (partida || avisoDePartida) router.replace("/app/politico/requerimentos", { scroll: false });
  };
  const [itens, setItens] = useState<DocumentoItem[]>(painel.itens);
  const [tipos, setTipos] = useState<TipoDeDocumento[]>(painel.tipos);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<SituacaoDoDocumento | "todas">("todas");
  const [configurando, setConfigurando] = useState(false);
  const ligados = useMemo(() => tiposLigados(tipos), [tipos]);

  function novo(funcao: FuncaoDoDocumento, deDemanda: PontoDePartida | null = null, subtipo: string | null = null): Rascunho {
    const tipo = tipos.find((t) => t.funcao === funcao)!;
    const comissao = funcao === "pedido_comissao";
    return {
      id: null,
      funcao,
      rotulo: tipo.rotulo,
      subtipo: comissao ? subtipo ?? "visita_tecnica" : "",
      assunto: deDemanda?.assunto ?? "",
      destinatario: comissao ? painel.lembrado.destinatario : deDemanda?.destinatarioSugerido ?? "",
      dispositivo: comissao ? painel.lembrado.dispositivo : "",
      orientacao: "",
      corpo: "",
      numero: "",
      situacao: "rascunho",
      protocolado_em: "",
      prazo_em: "",
      demandaId: deDemanda?.demandaId ?? null,
    };
  }

  // Chegou pelo atalho da visita: já abre um documento novo, se o gabinete usa pedido a comissão.
  const [aberto, setAberto] = useState<Rascunho | null>(() => {
    if (!partida || painel.semTabela) return null;
    const alvo = ligados.find((t) => t.funcao === "pedido_comissao") ?? ligados[0];
    return alvo ? novo(alvo.funcao, partida, subtipoInicial) : null;
  });

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return itens.filter(
      (d) =>
        (filtro === "todas" || d.situacao === filtro) &&
        (!t || [d.assunto, d.numero ?? "", d.destinatario ?? "", d.rotulo].some((c) => c.toLowerCase().includes(t))),
    );
  }, [itens, busca, filtro]);

  function editar(d: DocumentoItem) {
    setAberto({
      id: d.id,
      funcao: d.funcao,
      rotulo: d.rotulo,
      subtipo: d.subtipo ?? "",
      assunto: d.assunto,
      destinatario: d.destinatario ?? "",
      dispositivo: d.dispositivo ?? "",
      orientacao: "",
      corpo: d.corpo,
      numero: d.numero ?? "",
      situacao: d.situacao,
      protocolado_em: d.protocolado_em ?? "",
      prazo_em: d.prazo_em ?? "",
      demandaId: d.demanda_id,
    });
  }

  function aoSalvar(item: DocumentoItem) {
    setItens((antes) => [item, ...antes.filter((x) => x.id !== item.id)]);
    limparEndereco();
  }

  return (
    <div className="gip-ambient-bg mx-auto max-w-[860px] space-y-5 px-4 py-7">
      <CommandHero
        eyebrow="Gabinete · Ofícios e Requerimentos"
        titulo="Requerimentos"
        subtitulo="Os documentos que o gabinete apresenta à Casa: escreva com a IA, baixe no papel timbrado e acompanhe a situação de cada um."
        acoes={[]}
      />

      {avisoDePartida ? (
        <p className="rounded-xl p-3 text-sm" style={{ background: "#FFF6E0", color: "#7A4B00", border: "1px solid #F2D58A" }} role="status">
          {avisoDePartida}
        </p>
      ) : null}
      {painel.semTabela ? (
        <p className="rounded-xl p-4 text-sm" style={{ background: "#FFF6E0", color: "#7A4B00", border: "1px solid #F2D58A" }} role="status">
          Esta tela ainda não foi ativada no banco de dados desta instalação. Avise quem cuida do sistema.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {ligados.map((t) => (
              <button key={t.funcao} type="button" onClick={() => setAberto(novo(t.funcao))} className="wr-btn-dark inline-flex items-center gap-2">
                <FilePlus2 className="h-4 w-4" aria-hidden /> Novo: {t.rotulo}
              </button>
            ))}
            {painel.podeConfigurar ? (
              <button type="button" onClick={() => setConfigurando(true)} className="wr-btn ml-auto inline-flex items-center gap-2 text-sm">
                <Settings2 className="h-4 w-4" aria-hidden /> Tipos de documento
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex min-w-[220px] flex-1 items-center gap-2.5 rounded-full px-4"
              style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)", minHeight: 44 }}
            >
              <Search className="h-4 w-4 shrink-0" style={{ color: "var(--color-text-subtle)" }} aria-hidden />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por assunto, número ou destinatário"
                aria-label="Buscar documento"
                className="w-full bg-transparent py-2.5 text-sm outline-none"
                style={{ color: "var(--color-text)" }}
              />
            </div>
            <select
              value={filtro}
              onChange={(e) => setFiltro(e.target.value as SituacaoDoDocumento | "todas")}
              aria-label="Filtrar por situação"
              className="wr-input text-sm"
            >
              <option value="todas">Todas as situações</option>
              {(Object.keys(ROTULO_DA_SITUACAO) as SituacaoDoDocumento[]).map((s) => (
                <option key={s} value={s}>{ROTULO_DA_SITUACAO[s]}</option>
              ))}
            </select>
          </div>

          {visiveis.length === 0 ? (
            <p className="py-10 text-center text-sm" style={{ color: "var(--color-text-subtle)" }}>
              {itens.length === 0 ? "Nenhum documento ainda. Comece por um dos botões acima." : "Nenhum documento encontrado com esse filtro."}
            </p>
          ) : (
            <ul className="space-y-2">
              {visiveis.map((d) => {
                const cor = COR_DA_SITUACAO[d.situacao];
                const dias = diasParaOPrazo(d.prazo_em, d.situacao);
                const sub = SUBTIPOS_DE_COMISSAO.find((s) => s.valor === d.subtipo)?.rotulo ?? d.subtipo;
                return (
                  <li key={d.id}>
                    <button type="button" onClick={() => editar(d)} className="gip-glass gip-glass-hover flex w-full items-start gap-3 p-4 text-left">
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                        style={{ background: "color-mix(in srgb, var(--color-accent) 12%, transparent)", color: "var(--accent-ink, var(--color-accent))" }}
                        aria-hidden
                      >
                        <FileText className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-bold" style={{ color: "var(--color-text)" }}>
                            {d.rotulo}{sub ? ` · ${sub}` : ""}{d.numero ? ` · nº ${d.numero}` : ""}
                          </span>
                          <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: cor.fundo, color: cor.texto }}>
                            {ROTULO_DA_SITUACAO[d.situacao]}
                          </span>
                          {dias !== null ? (
                            <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={dias < 0 ? { background: "#FDE8E8", color: "#B42318" } : { background: "#FFF6E0", color: "#7A4B00" }}>
                              {dias < 0 ? `Prazo vencido há ${-dias} ${-dias === 1 ? "dia" : "dias"}` : dias === 0 ? "Prazo vence hoje" : `Prazo em ${dias} ${dias === 1 ? "dia" : "dias"}`}
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block truncate text-sm" style={{ color: "var(--color-text-muted)" }}>{d.assunto}</span>
                        <span className="mt-0.5 block truncate text-xs" style={{ color: "var(--color-text-subtle)" }}>
                          {d.destinatario ? `${d.destinatario} · ` : ""}{d.protocolado_em ? `protocolado em ${fmtData(d.protocolado_em)}` : `atualizado em ${fmtData(d.updated_at)}`}
                          {d.temPdf ? " · PDF guardado" : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {aberto ? (
        <Editor
          key={aberto.id ?? "novo"}
          inicial={aberto}
          aoFechar={() => {
            setAberto(null);
            limparEndereco();
          }}
          aoSalvar={aoSalvar}
          aoApagar={(id) => setItens((antes) => antes.filter((x) => x.id !== id))}
        />
      ) : null}
      {configurando ? <TiposDoGabinete tipos={tipos} aoFechar={() => setConfigurando(false)} aoSalvar={setTipos} /> : null}
    </div>
  );
}

/**
 * Fecha a janela pelo fundo só quando o clique COMEÇA e termina nele (selecionar um texto e
 * soltar o mouse fora não fecha) e pela tecla Esc.
 */
function useFecharPeloFundo(fechar: () => void) {
  const comecouNoFundo = useRef(false);
  const fecharRef = useRef(fechar);
  fecharRef.current = fechar;
  useEffect(() => {
    const aoTeclar = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") fecharRef.current();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);
  return {
    onMouseDown: (e: MouseEvent<HTMLDivElement>) => {
      comecouNoFundo.current = e.target === e.currentTarget;
    },
    onClick: (e: MouseEvent<HTMLDivElement>) => {
      if (comecouNoFundo.current && e.target === e.currentTarget) fecharRef.current();
      comecouNoFundo.current = false;
    },
  };
}

function Editor({
  inicial,
  aoFechar,
  aoSalvar,
  aoApagar,
}: {
  inicial: Rascunho;
  aoFechar: () => void;
  aoSalvar: (item: DocumentoItem) => void;
  aoApagar: (id: string) => void;
}) {
  const [r, setR] = useState<Rascunho>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [redigindo, redigir] = useTransition();
  const [ocupadoCom, setOcupadoCom] = useState<"salvar" | "pdf" | "apagar" | null>(null);
  /** Há mudança na tela que ainda não foi salva? */
  const [sujo, setSujo] = useState(inicial.id === null);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const ocupado = redigindo || ocupadoCom !== null;
  const dest = rotuloDoDestinatario(r.funcao);
  const lacunas = lacunasDoTexto(r.corpo);

  function mudar<K extends keyof Rascunho>(campo: K, valor: Rascunho[K]) {
    setR((a) => ({ ...a, [campo]: valor }));
    setSujo(true);
    setAviso(null);
    if (campo === "corpo") setPdfUrl(null);
  }

  function fechar() {
    if (ocupado) return;
    if (sujo && (r.corpo.trim() || r.assunto.trim()) && !window.confirm("Há mudanças não salvas. Fechar mesmo assim?")) return;
    aoFechar();
  }

  function pedirRedacao() {
    setErro(null);
    if (!r.assunto.trim()) return setErro("Escreva o assunto antes de redigir.");
    if (r.corpo.trim() && !window.confirm("Redigir de novo substitui o texto que está na tela. Continuar?")) return;
    redigir(async () => {
      const res = await redigirDocumento({
        funcao: r.funcao,
        subtipo: r.subtipo,
        assunto: r.assunto,
        destinatario: r.destinatario,
        dispositivo: r.dispositivo,
        orientacao: r.orientacao,
        demandaId: r.demandaId,
      });
      if (res.ok) mudar("corpo", res.texto);
      else setErro(res.erro);
    });
  }

  /** Salva e devolve o id (ou null se falhou). */
  async function salvar(): Promise<string | null> {
    setErro(null);
    const res = await salvarDocumento(r.id, r, r.id === null ? r.demandaId : undefined);
    if (!res.ok) {
      setErro(res.erro);
      return null;
    }
    aoSalvar(res.item);
    setR((a) => ({ ...a, id: res.item.id, situacao: res.item.situacao }));
    setSujo(false);
    return res.item.id;
  }

  async function aoClicarSalvar() {
    setOcupadoCom("salvar");
    const id = await salvar();
    setOcupadoCom(null);
    if (id) setAviso("Salvo.");
  }

  async function baixarPdf() {
    setPdfUrl(null);
    // A aba abre JÁ, no clique: depois da espera o navegador bloquearia.
    const aba = window.open("", "_blank");
    if (aba) aba.opener = null;
    setOcupadoCom("pdf");
    try {
      const id = sujo || !r.id ? await salvar() : r.id;
      if (!id) return aba?.close();
      const res = await baixarPdfDoDocumento(id);
      if (res.ok) {
        setPdfUrl(res.url);
        if (aba) aba.location.href = res.url;
      } else {
        aba?.close();
        setErro(res.erro);
      }
    } catch {
      aba?.close();
      setErro("Não consegui gerar o PDF agora. Tente de novo.");
    } finally {
      setOcupadoCom(null);
    }
  }

  async function apagar() {
    if (!r.id || !window.confirm("Apagar este rascunho? Não dá para desfazer.")) return;
    setOcupadoCom("apagar");
    const res = await excluirDocumento(r.id);
    setOcupadoCom(null);
    if (!res.ok) return setErro(res.erro);
    aoApagar(r.id);
    aoFechar();
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(r.corpo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro("Não consegui copiar. Selecione o texto e copie à mão.");
    }
  }

  function irPara(inicio: number, fim: number) {
    const a = areaRef.current;
    if (!a) return;
    a.focus();
    a.setSelectionRange(inicio, fim);
    const linhasAntes = a.value.slice(0, inicio).split("\n").length - 1;
    const alturaDaLinha = parseFloat(getComputedStyle(a).lineHeight) || 22;
    a.scrollTop = Math.max(0, linhasAntes * alturaDaLinha - a.clientHeight / 3);
  }

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    const a = e.currentTarget;
    const res = enterEmLista(a.value, a.selectionStart, a.selectionEnd);
    if (!res) return;
    e.preventDefault();
    a.value = res.texto;
    a.setSelectionRange(res.cursor, res.cursor);
    mudar("corpo", res.texto);
  }

  const fundo = useFecharPeloFundo(fechar);
  const rotuloCampo = "block text-sm font-semibold";
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      {...fundo}
    >
      <div
        className="flex max-h-[94dvh] w-full max-w-2xl flex-col rounded-2xl p-4 sm:p-5"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={r.rotulo}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>{r.rotulo}</h3>
            <p className="mt-0.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
              {r.demandaId ? "Nasce de uma demanda do gabinete: a IA usa o que foi registrado nela. " : ""}Nada é enviado a ninguém por aqui.
            </p>
          </div>
          <button type="button" onClick={fechar} className="rounded-full p-1" style={{ color: "var(--color-text-subtle)" }} aria-label="Fechar">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {r.funcao === "pedido_comissao" ? (
            <div className="flex flex-wrap items-center gap-2">
              {SUBTIPOS_DE_COMISSAO.map((s) => (
                <button
                  key={s.valor}
                  type="button"
                  onClick={() => mudar("subtipo", s.valor)}
                  aria-pressed={r.subtipo === s.valor}
                  className="rounded-full px-3.5 py-1.5 text-sm font-semibold"
                  style={
                    r.subtipo === s.valor
                      ? { background: "var(--chip-active-bg)", color: "var(--chip-active-fg)" }
                      : { background: "var(--color-surface-elevated)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }
                  }
                >
                  {s.rotulo}
                </button>
              ))}
              <input
                value={SUBTIPOS_DE_COMISSAO.some((s) => s.valor === r.subtipo) ? "" : r.subtipo}
                onChange={(e) => mudar("subtipo", e.target.value)}
                maxLength={60}
                placeholder="ou outro pedido (ex.: seminário)"
                aria-label="Outro pedido à comissão"
                className="wr-input min-w-[180px] flex-1 text-sm"
              />
            </div>
          ) : null}

          <label className={rotuloCampo} style={{ color: "var(--color-text)" }}>
            Assunto
            <input value={r.assunto} onChange={(e) => mudar("assunto", e.target.value)} maxLength={300} className="wr-input mt-1 w-full font-normal" placeholder="Ex.: Falta de iluminação na Rua das Acácias" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={rotuloCampo} style={{ color: "var(--color-text)" }}>
              {dest.campo}
              <input value={r.destinatario} onChange={(e) => mudar("destinatario", e.target.value)} maxLength={300} className="wr-input mt-1 w-full font-normal" placeholder={dest.exemplo} />
            </label>
            <label className={rotuloCampo} style={{ color: "var(--color-text)" }}>
              Artigo do regimento
              <input value={r.dispositivo} onChange={(e) => mudar("dispositivo", e.target.value)} maxLength={200} className="wr-input mt-1 w-full font-normal" placeholder="Como a sua Casa escreve" />
            </label>
          </div>
          <label className={rotuloCampo} style={{ color: "var(--color-text)" }}>
            O que a IA precisa saber <span className="font-normal" style={{ color: "var(--color-text-subtle)" }}>(opcional)</span>
            <textarea
              value={r.orientacao}
              onChange={(e) => setR((a) => ({ ...a, orientacao: e.target.value }))}
              rows={2}
              maxLength={1500}
              className="wr-input mt-1 w-full text-sm font-normal"
              placeholder="Fatos, local, data, quem convidar. O que não for dito aqui a IA deixa entre [COLCHETES]."
            />
          </label>

          <button type="button" onClick={pedirRedacao} disabled={ocupado} className="wr-btn-dark inline-flex items-center gap-2 disabled:opacity-60">
            {redigindo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
            {redigindo ? "Redigindo…" : r.corpo.trim() ? "Redigir de novo" : "Redigir com IA"}
          </button>

          <textarea
            ref={areaRef}
            value={r.corpo}
            onChange={(e) => mudar("corpo", e.target.value)}
            onKeyDown={aoTeclar}
            readOnly={redigindo}
            rows={12}
            className="wr-input w-full text-sm leading-relaxed"
            aria-label="Texto do documento"
            placeholder="O texto aparece aqui. Você também pode escrever direto."
          />
          {lacunas.length > 0 ? (
            <div className="rounded-lg p-2.5 text-xs" style={{ background: "#FFF6E0", color: "#7A4B00", border: "1px solid #F2D58A" }} role="status">
              <p className="font-semibold">
                {lacunas.length === 1 ? "Falta preencher 1 trecho" : `Faltam preencher ${lacunas.length} trechos`} que a IA não sabia — o PDF só sai depois disso:
              </p>
              <ul className="mt-1 space-y-1">
                {lacunas.slice(0, 6).map((l, i) => (
                  <li key={`${l.inicio}-${i}`}>
                    <button type="button" onClick={() => irPara(l.inicio, l.fim)} className="text-left underline">{l.trecho}</button>
                  </li>
                ))}
              </ul>
              <p className="mt-1">Clique num trecho para ir até ele. Apague os colchetes junto com o texto de dentro.</p>
            </div>
          ) : null}

          <fieldset className="rounded-xl p-3" style={{ border: "1px solid var(--color-border)" }}>
            <legend className="px-1 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>Acompanhamento</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={rotuloCampo} style={{ color: "var(--color-text)" }}>
                Situação
                <select value={r.situacao} onChange={(e) => mudar("situacao", e.target.value as SituacaoDoDocumento)} className="wr-input mt-1 w-full font-normal">
                  {situacoesDaFuncao(r.funcao).filter((s) => s !== "rascunho" || inicial.situacao === "rascunho").map((s) => (
                    <option key={s} value={s}>{ROTULO_DA_SITUACAO[s]}</option>
                  ))}
                </select>
              </label>
              <label className={rotuloCampo} style={{ color: "var(--color-text)" }}>
                Número dado pela Casa
                <input value={r.numero} onChange={(e) => mudar("numero", e.target.value)} maxLength={60} className="wr-input mt-1 w-full font-normal" placeholder="Depois de protocolar" />
              </label>
              <label className={rotuloCampo} style={{ color: "var(--color-text)" }}>
                Protocolado em
                <input type="date" value={r.protocolado_em} onChange={(e) => mudar("protocolado_em", e.target.value)} className="wr-input mt-1 w-full font-normal" />
              </label>
              <label className={rotuloCampo} style={{ color: "var(--color-text)" }}>
                Prazo de resposta <span className="font-normal" style={{ color: "var(--color-text-subtle)" }}>(se a sua Casa tiver)</span>
                <input type="date" value={r.prazo_em} onChange={(e) => mudar("prazo_em", e.target.value)} className="wr-input mt-1 w-full font-normal" />
              </label>
            </div>
          </fieldset>

          {erro ? <p className="text-sm font-semibold" style={{ color: "#C82333" }} role="alert">{erro}</p> : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
          <span className="mr-auto text-xs font-semibold" style={{ color: "var(--color-text-muted)" }} role="status">
            {pdfUrl ? (
              <>
                PDF guardado.{" "}
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--color-text)" }}>Abrir o PDF</a>
              </>
            ) : (
              aviso
            )}
          </span>
          {r.id && inicial.situacao === "rascunho" && r.situacao === "rascunho" && !inicial.numero && !inicial.protocolado_em ? (
            <button type="button" onClick={apagar} disabled={ocupado} className="wr-btn inline-flex items-center gap-2 disabled:opacity-60" aria-label="Apagar rascunho">
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
          <button type="button" onClick={copiar} disabled={!r.corpo.trim()} className="wr-btn inline-flex items-center gap-2 disabled:opacity-60">
            {copiado ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copiado ? "Copiado" : "Copiar texto"}
          </button>
          <button type="button" onClick={aoClicarSalvar} disabled={ocupado || !r.assunto.trim()} className="wr-btn inline-flex items-center gap-2 disabled:opacity-60">
            {ocupadoCom === "salvar" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
            Salvar
          </button>
          <button
            type="button"
            onClick={baixarPdf}
            disabled={ocupado || lacunas.length > 0 || !r.corpo.trim() || !r.assunto.trim()}
            title={lacunas.length > 0 ? "Preencha o que está entre colchetes para gerar o PDF" : undefined}
            className="wr-btn-dark inline-flex items-center gap-2 disabled:opacity-60"
          >
            {ocupadoCom === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileDown className="h-4 w-4" aria-hidden />}
            {ocupadoCom === "pdf" ? "Gerando…" : "Baixar PDF no timbrado"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TiposDoGabinete({
  tipos,
  aoFechar,
  aoSalvar,
}: {
  tipos: TipoDeDocumento[];
  aoFechar: () => void;
  aoSalvar: (t: TipoDeDocumento[]) => void;
}) {
  const [lista, setLista] = useState<TipoDeDocumento[]>(tipos);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function aplicarModelo(m: ModeloDeCasa) {
    setLista(MODELOS_DE_CASA[m].tipos.map((t) => ({ ...t })));
  }
  function mudar(funcao: FuncaoDoDocumento, parte: Partial<TipoDeDocumento>) {
    setLista((a) => a.map((t) => (t.funcao === funcao ? { ...t, ...parte } : t)));
  }
  const mudou = JSON.stringify(lista) !== JSON.stringify(tipos);
  const fundo = useFecharPeloFundo(() => {
    if (salvando) return;
    if (mudou && !window.confirm("Há mudanças não salvas. Fechar mesmo assim?")) return;
    aoFechar();
  });
  async function salvar() {
    setErro(null);
    setSalvando(true);
    const res = await salvarTiposDeDocumento(lista);
    setSalvando(false);
    if (!res.ok) return setErro(res.erro);
    aoSalvar(res.tipos);
    aoFechar();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4" style={{ background: "rgba(0,0,0,0.5)" }} {...fundo}>
      <div
        className="flex max-h-[94dvh] w-full max-w-xl flex-col rounded-2xl p-4 sm:p-5"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Tipos de documento"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>Tipos de documento do gabinete</h3>
            <p className="mt-0.5 text-sm" style={{ color: "var(--color-text-muted)" }}>
              Cada Casa dá um nome ao mesmo pedido. Ligue só o que o seu gabinete usa e escreva o nome como a sua Casa chama.
            </p>
          </div>
          <button type="button" onClick={() => !salvando && aoFechar()} className="rounded-full p-1" style={{ color: "var(--color-text-subtle)" }} aria-label="Fechar">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>Começar por um modelo</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {(Object.keys(MODELOS_DE_CASA) as ModeloDeCasa[]).map((m) => (
                <button key={m} type="button" onClick={() => aplicarModelo(m)} className="wr-btn text-left text-sm">
                  <span className="block font-semibold">{MODELOS_DE_CASA[m].nome}</span>
                  <span className="block text-xs" style={{ color: "var(--color-text-subtle)" }}>{MODELOS_DE_CASA[m].onde}</span>
                </button>
              ))}
            </div>
          </div>

          {lista.map((t) => {
            const d = DESCRICAO_DA_FUNCAO[t.funcao];
            return (
              <div key={t.funcao} className="rounded-xl p-3" style={{ border: "1px solid var(--color-border)", opacity: t.ligado ? 1 : 0.75 }}>
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" checked={t.ligado} onChange={(e) => mudar(t.funcao, { ligado: e.target.checked })} className="mt-1 h-4 w-4" />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold" style={{ color: "var(--color-text)" }}>{d.nome}</span>
                    <span className="block text-xs" style={{ color: "var(--color-text-muted)" }}>{d.paraQue}</span>
                  </span>
                </label>
                <label className="mt-2 block text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>
                  Como a sua Casa chama
                  <input
                    value={t.rotulo}
                    onChange={(e) => mudar(t.funcao, { rotulo: e.target.value })}
                    maxLength={60}
                    className="wr-input mt-1 w-full text-sm font-normal"
                    placeholder={d.exemplos}
                  />
                </label>
              </div>
            );
          })}
          {erro ? <p className="text-sm font-semibold" style={{ color: "#C82333" }} role="alert">{erro}</p> : null}
        </div>

        <div className="mt-3 flex justify-end gap-2 border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
          <button type="button" onClick={aoFechar} disabled={salvando} className="wr-btn disabled:opacity-60">Cancelar</button>
          <button type="button" onClick={salvar} disabled={salvando} className="wr-btn-dark inline-flex items-center gap-2 disabled:opacity-60">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />} Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
