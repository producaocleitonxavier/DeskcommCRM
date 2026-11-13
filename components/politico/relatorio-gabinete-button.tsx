"use client";

/**
 * Botão "Relatório PDF" genérico do Gabinete (Lideranças, Emendas, Projetos).
 * Monta o conteúdo a partir do que já está na tela e chama a server action,
 * abrindo o PDF numa nova aba. Substitui o antigo export CSV dessas telas.
 */

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";

import { gerarRelatorioGabinete, type RelatorioGabineteInputCliente } from "@/app/actions/politico/gerarRelatorioGabinete";

export function RelatorioGabineteButton({ dados, label = "Baixar relatório (PDF)", destaque = true }: { dados: RelatorioGabineteInputCliente; label?: string; /** Botão em destaque (verde) quando é a ação principal da faixa. */ destaque?: boolean }) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const vazio = dados.linhas.length === 0;

  return (
    <div className="relative">
      <button
        type="button"
        disabled={gerando || vazio}
        onClick={async () => {
          setErro(null);
          setGerando(true);
          const res = await gerarRelatorioGabinete(dados);
          setGerando(false);
          if (res.ok) window.open(res.url, "_blank", "noopener,noreferrer");
          else setErro(res.erro);
        }}
        className={`${destaque ? "wr-btn-dark" : "wr-btn"} inline-flex items-center gap-2 disabled:opacity-60`}
      >
        {gerando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileText className="h-4 w-4" aria-hidden />}
        {gerando ? "Gerando…" : label}
      </button>
      {erro && (
        <span className="absolute right-0 top-full mt-1 whitespace-nowrap text-xs" style={{ color: "#A3302A" }}>
          {erro}
        </span>
      )}
    </div>
  );
}

export default RelatorioGabineteButton;
