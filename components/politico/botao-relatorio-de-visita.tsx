"use client";

/**
 * BotaoRelatorioDeVisita — gera o relatório da visita em PDF, no papel timbrado, com
 * o que a equipe registrou (data, presentes, relato, encaminhamentos) e as fotos.
 * Só aparece em visita REALIZADA e para quem emite documentos do gabinete.
 */
import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";

import { gerarRelatorioDeVisita } from "@/app/actions/politico/relatorioDeVisita";

export function BotaoRelatorioDeVisita({ demandaId }: { demandaId: string }) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  async function gerar() {
    setErro(null);
    setUrl(null);
    // A aba abre JÁ, no clique: depois da espera o navegador bloquearia.
    const aba = window.open("", "_blank");
    if (aba) aba.opener = null;
    setGerando(true);
    try {
      const r = await gerarRelatorioDeVisita(demandaId);
      if (r.ok) {
        setUrl(r.url);
        if (aba) aba.location.href = r.url;
      } else {
        aba?.close();
        setErro(r.erro);
      }
    } catch {
      aba?.close();
      setErro("Não consegui gerar o relatório agora. Tente de novo.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={gerar} disabled={gerando} className="wr-btn inline-flex items-center gap-1.5 text-sm disabled:opacity-60">
        {gerando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileText className="h-4 w-4" aria-hidden />}
        {gerando ? "Gerando…" : "Relatório (PDF)"}
      </button>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold underline" style={{ color: "var(--color-text)" }}>
          Abrir o relatório
        </a>
      ) : null}
      {erro ? (
        <span className="text-xs font-semibold" style={{ color: "#C82333" }} role="alert">
          {erro}
        </span>
      ) : null}
    </span>
  );
}
