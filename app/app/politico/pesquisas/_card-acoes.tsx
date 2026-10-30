"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlayCircle, StopCircle, Trash2 } from "lucide-react";

import { definirStatusPesquisa, excluirPesquisa } from "@/app/actions/politico/pesquisa-actions";

export default function CardAcoes({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setStatus(s: "active" | "completed") {
    setBusy(true);
    await definirStatusPesquisa(id, s);
    setBusy(false);
    router.refresh();
  }
  async function excluir() {
    if (!window.confirm("Excluir esta pesquisa? As respostas coletadas serão perdidas.")) return;
    setBusy(true);
    await excluirPesquisa(id);
    setBusy(false);
    router.refresh();
  }

  const base = "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-60";
  return (
    <div className="flex flex-wrap gap-2">
      {status === "draft" && (
        <button type="button" onClick={() => setStatus("active")} disabled={busy} className={base} style={{ background: "rgba(23,120,79,0.14)", color: "#17784F" }}>
          <PlayCircle className="h-3.5 w-3.5" /> Ativar
        </button>
      )}
      {status === "active" && (
        <button type="button" onClick={() => setStatus("completed")} disabled={busy} className={base} style={{ background: "rgba(224,128,121,0.14)", color: "#A3302A" }}>
          <StopCircle className="h-3.5 w-3.5" /> Encerrar
        </button>
      )}
      <button type="button" onClick={excluir} disabled={busy} className={base} style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-subtle)" }}>
        <Trash2 className="h-3.5 w-3.5" /> Excluir
      </button>
    </div>
  );
}
