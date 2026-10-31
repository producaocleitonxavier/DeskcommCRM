"use client";

/**
 * Importação inteligente de contatos — tela. Três etapas, à prova de criança:
 *  1) Sobe a planilha (Excel/CSV).
 *  2) Confere o que o sistema ENTENDEU das colunas (e corrige se quiser).
 *  3) Importa e vê o relatório. + Exportar a base num CSV organizado.
 */
import { useRef, useState, useTransition } from "react";
import {
  Upload, FileSpreadsheet, Download, CheckCircle2, AlertTriangle, Loader2,
  ArrowRight, RotateCcw, Sparkles,
} from "lucide-react";

import { CommandHero } from "@/components/politico/command-hero";
import {
  previewImportacao, importarContatos,
  type PreviewOk, type RelatorioImport,
} from "@/app/actions/politico/importarContatos";
import { exportarContatos } from "@/app/actions/politico/exportarContatos";
import { CAMPOS_NA_ORDEM, ROTULO_CAMPO, type CampoPolitico } from "@/lib/politico/importar-mapeamento";

type Etapa = "upload" | "mapear" | "resultado";

export default function ImportarClient() {
  const [etapa, setEtapa] = useState<Etapa>("upload");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewOk | null>(null);
  const [mapa, setMapa] = useState<Record<CampoPolitico, number | null>>({} as Record<CampoPolitico, number | null>);
  const [relatorio, setRelatorio] = useState<RelatorioImport | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function escolherArquivo(file: File) {
    setErro(null);
    setArquivo(file);
    const fd = new FormData();
    fd.append("file", file);
    start(async () => {
      const r = await previewImportacao(fd);
      if (!r.ok) { setErro(r.erro); return; }
      setPreview(r);
      setMapa(r.sugestao);
      setEtapa("mapear");
    });
  }

  function importar() {
    if (!arquivo) return;
    setErro(null);
    const fd = new FormData();
    fd.append("file", arquivo);
    fd.append("mapping", JSON.stringify(mapa));
    start(async () => {
      const r = await importarContatos(fd);
      if (!r.ok) { setErro(r.erro); return; }
      setRelatorio(r);
      setEtapa("resultado");
    });
  }

  function exportar() {
    setErro(null);
    start(async () => {
      const r = await exportarContatos();
      if (!r.ok) { setErro(r.erro); return; }
      const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = r.nome; a.click();
      URL.revokeObjectURL(url);
    });
  }

  function recomecar() {
    setEtapa("upload"); setArquivo(null); setPreview(null); setRelatorio(null); setErro(null);
    setMapa({} as Record<CampoPolitico, number | null>);
    if (inputRef.current) inputRef.current.value = "";
  }

  const mapCampo = (campo: CampoPolitico) => (preview ? (mapa[campo] ?? null) : null);
  const setCampo = (campo: CampoPolitico, v: string) =>
    setMapa((m) => ({ ...m, [campo]: v === "" ? null : Number(v) }));
  const reconhecidos = CAMPOS_NA_ORDEM.filter((c) => mapCampo(c) != null).length;

  return (
    <div className="mx-auto max-w-[960px] space-y-5 px-4 py-7" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Pessoas · Importação inteligente"
        titulo="Importar lista"
        subtitulo="Suba a planilha do seu gabinete (Excel ou CSV). O sistema entende as colunas sozinho — você só confere."
        extra={
          <button type="button" onClick={exportar} disabled={ocupado}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-60"
            style={{ background: "rgba(255,255,255,0.12)", color: "#FFF", border: "1px solid rgba(255,255,255,0.25)" }}>
            <Download size={13} /> Exportar base
          </button>
        }
      />

      {erro && (
        <div className="wr-card flex items-center gap-2 p-3 text-sm" style={{ borderColor: "rgba(248,113,113,0.5)", color: "#F87171" }}>
          <AlertTriangle size={16} /> {erro}
        </div>
      )}

      {/* ETAPA 1 — upload */}
      {etapa === "upload" && (
        <div className="wr-card p-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "rgba(215,243,106,0.16)", color: "#8AA62E" }}>
            <FileSpreadsheet size={26} />
          </div>
          <p className="mx-auto max-w-md text-sm" style={{ color: "var(--color-text-muted)" }}>
            Arraste sua planilha aqui, ou escolha o arquivo. Aceita <strong>Excel (.xlsx)</strong> e <strong>.csv</strong>.
            Pode estar bagunçada — o sistema <strong>se adapta</strong>: reconhece nome, telefone, CPF, cidade, bairro…
            mesmo com nomes diferentes de coluna.
          </p>
          <label
            className="mx-auto mt-5 flex max-w-md cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-8 transition hover:brightness-110"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-elevated)" }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) escolherArquivo(f); }}
          >
            {ocupado ? <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#8AA62E" }} /> : <Upload className="h-6 w-6" style={{ color: "#8AA62E" }} />}
            <span className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              {ocupado ? "Lendo a planilha…" : "Clique ou arraste o arquivo"}
            </span>
            <input ref={inputRef} type="file" accept=".csv,.xlsx,text/csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) escolherArquivo(f); }} />
          </label>
        </div>
      )}

      {/* ETAPA 2 — conferir o mapeamento */}
      {etapa === "mapear" && preview && (
        <>
          <div className="wr-card p-4" style={{ border: "1px solid rgba(92,127,35,0.4)", background: "rgba(215,243,106,0.06)" }}>
            <p className="inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: "#5C7F23" }}>
              <Sparkles size={15} /> O sistema entendeu {reconhecidos} coluna(s) sozinho.
            </p>
            <p className="mt-1 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
              Confira abaixo e corrija se precisar. Coluna que não encaixa em nada é guardada como <strong>campo extra</strong> — nada se perde.
              Encontramos <strong>{preview.totalLinhas}</strong> linha(s).
            </p>
          </div>

          <div className="wr-card p-5">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>Conferir colunas</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {CAMPOS_NA_ORDEM.map((campo) => (
                <label key={campo} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}>
                  <span className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{ROTULO_CAMPO[campo]}</span>
                  <select
                    value={mapCampo(campo) ?? ""}
                    onChange={(e) => setCampo(campo, e.target.value)}
                    className="max-w-[55%] rounded-lg px-2 py-1.5 text-[13px]"
                    style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                  >
                    <option value="">— não tenho —</option>
                    {preview.headers.map((h, i) => (
                      <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>

          {/* Amostra */}
          <div className="wr-card p-5">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>Amostra (primeiras linhas)</p>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr>{preview.headers.map((h, i) => (
                    <th key={i} className="whitespace-nowrap px-2 py-1.5 text-left font-bold" style={{ color: "var(--color-text-subtle)", borderBottom: "1px solid var(--color-border)" }}>{h || `Col ${i + 1}`}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {preview.amostra.map((linha, r) => (
                    <tr key={r}>{preview.headers.map((_, i) => (
                      <td key={i} className="whitespace-nowrap px-2 py-1.5" style={{ color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border)" }}>{linha[i] ?? ""}</td>
                    ))}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={recomecar} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
              <RotateCcw size={14} /> Trocar arquivo
            </button>
            <button type="button" onClick={importar} disabled={ocupado} className="wr-btn-dark inline-flex items-center gap-2 disabled:opacity-60">
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {ocupado ? "Importando…" : `Importar ${preview.totalLinhas} contato(s)`}
            </button>
          </div>
        </>
      )}

      {/* ETAPA 3 — resultado */}
      {etapa === "resultado" && relatorio && (
        <div className="wr-card p-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(215,243,106,0.16)", color: "#8AA62E" }}>
            <CheckCircle2 size={28} />
          </div>
          <h2 className="font-heading text-2xl font-bold" style={{ color: "var(--color-text)" }}>Importação concluída!</h2>
          <div className="mx-auto mt-5 grid max-w-md grid-cols-3 gap-3">
            <div className="wr-card p-3" style={{ background: "var(--color-surface-elevated)" }}>
              <p className="font-heading text-2xl font-black" style={{ color: "#17784F" }}>{relatorio.importados}</p>
              <p className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>importados</p>
            </div>
            <div className="wr-card p-3" style={{ background: "var(--color-surface-elevated)" }}>
              <p className="font-heading text-2xl font-black" style={{ color: "#92600A" }}>{relatorio.duplicados}</p>
              <p className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>já existiam</p>
            </div>
            <div className="wr-card p-3" style={{ background: "var(--color-surface-elevated)" }}>
              <p className="font-heading text-2xl font-black" style={{ color: relatorio.erros.length ? "#A3302A" : "var(--color-text)" }}>{relatorio.erros.length}</p>
              <p className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>com problema</p>
            </div>
          </div>

          {relatorio.erros.length > 0 && (
            <div className="mx-auto mt-4 max-w-md rounded-xl p-3 text-left text-[12px]" style={{ background: "rgba(163,48,42,0.08)", border: "1px solid rgba(163,48,42,0.3)" }}>
              <p className="mb-1 font-bold" style={{ color: "#A3302A" }}>Linhas com problema:</p>
              {relatorio.erros.slice(0, 10).map((e, i) => (
                <p key={i} style={{ color: "var(--color-text-muted)" }}>Linha {e.linha}: {e.motivo}</p>
              ))}
            </div>
          )}

          <div className="mt-6 flex items-center justify-center gap-3">
            <button type="button" onClick={recomecar} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
              <Upload size={14} /> Importar outra lista
            </button>
            <button type="button" onClick={exportar} disabled={ocupado} className="wr-btn-dark inline-flex items-center gap-2 disabled:opacity-60">
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Exportar base
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
