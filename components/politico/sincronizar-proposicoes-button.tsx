"use client";

/**
 * Botão "Sincronizar do governo" — puxa as proposições do parlamentar da API
 * aberta da Câmara dos Deputados (projetos, PECs, requerimentos…) com a situação
 * atual. Só admin. Mensagem curta e clara (à prova de criança). Deputado federal
 * popula; vereador/quem não é deputado federal volta "nada encontrado" (e tudo bem).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";

import { sincronizarProposicoesGov } from "@/app/actions/politico/sincronizarProposicoesGov";

export function SincronizarProposicoesButton() {
  const router = useRouter();
  const [carregando, setCarregando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sync() {
    setMsg(null);
    setCarregando(true);
    const r = await sincronizarProposicoesGov();
    setCarregando(false);
    if (!r.ok) {
      setMsg("Não consegui sincronizar agora. Tente de novo.");
      return;
    }
    if (r.semNome) {
      setMsg("Informe o nome do parlamentar na Identidade do Mandato.");
      return;
    }
    if (r.naoEhDeputado) {
      setMsg("Nenhum deputado federal ou senador com esse nome em Brasília.");
      return;
    }
    if (r.total === 0) {
      setMsg("Nenhuma proposição encontrada para este parlamentar.");
      return;
    }
    const onde = r.fonte === "senado" ? "Senado" : "Câmara";
    setMsg(`${onde}: ${r.inseridas} nova(s) · ${r.atualizadas} atualizada(s).`);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={sync}
        disabled={carregando}
        className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-60"
        style={{ background: "rgba(255,255,255,0.12)", color: "#FFFFFF", border: "1px solid rgba(255,255,255,0.25)" }}
      >
        {carregando ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        {carregando ? "Sincronizando…" : "Sincronizar do governo"}
      </button>
      {msg && (
        <span className="text-[11px] text-right" style={{ color: "rgba(255,255,255,0.75)" }}>
          {msg}
        </span>
      )}
    </div>
  );
}
