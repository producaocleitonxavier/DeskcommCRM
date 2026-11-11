"use client";

/**
 * Botão "Emendas da ALMG" — puxa as emendas ESTADUAIS do parlamentar do CSV
 * oficial da Assembleia Legislativa de MG (ciclo do dinheiro real) para a lista.
 * Só admin. Resultado curto e claro (à prova de criança). Deputado estadual de
 * MG popula; vereador/federal volta "nenhuma emenda estadual" (e tudo bem).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark, Loader2 } from "lucide-react";

import { sincronizarEmendasAlmg } from "@/app/actions/politico/sincronizarEmendasAlmg";

export function SincronizarEmendasAlmgButton() {
  const router = useRouter();
  const [carregando, setCarregando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sync() {
    setMsg(null);
    setCarregando(true);
    const r = await sincronizarEmendasAlmg();
    setCarregando(false);
    if (!r.ok) {
      setMsg("Não consegui sincronizar a ALMG agora. Tente de novo.");
      return;
    }
    if (r.semNome) {
      setMsg("Informe o nome do parlamentar na Identidade do Mandato.");
      return;
    }
    if (r.total === 0) {
      setMsg("Nenhuma emenda estadual (ALMG) para este parlamentar.");
      return;
    }
    setMsg(`${r.inseridas} nova(s) · ${r.atualizadas} atualizada(s).`);
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
        {carregando ? <Loader2 size={15} className="animate-spin" /> : <Landmark size={15} />}
        {carregando ? "Sincronizando…" : "Emendas da ALMG"}
      </button>
      {msg && (
        <span className="text-[11px] text-right" style={{ color: "rgba(255,255,255,0.75)" }}>
          {msg}
        </span>
      )}
    </div>
  );
}
