"use client";

/**
 * Interruptor do ciclo da demanda (só admin): quando uma demanda é marcada como
 * resolvida, o cidadão é avisado sozinho no WhatsApp. Otimista — reverte se a
 * gravação falhar. A gravação e o gate vivem em
 * `app/actions/politico/definirAvisoDeResolucao.ts`.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { definirAvisoDeResolucao } from "@/app/actions/politico/definirAvisoDeResolucao";

export default function AvisoAutoToggle({ ligadoInicial }: { ligadoInicial: boolean }) {
  const router = useRouter();
  const [ligado, setLigado] = useState(ligadoInicial);
  const [erro, setErro] = useState(false);
  const [pend, start] = useTransition();

  function alternar() {
    const novo = !ligado;
    setErro(false);
    setLigado(novo);
    start(async () => {
      const r = await definirAvisoDeResolucao(novo);
      if (!r.ok) {
        setLigado(!novo);
        setErro(true);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <button
      type="button"
      onClick={alternar}
      disabled={pend}
      title="Quando uma demanda é marcada como resolvida, o cidadão é avisado sozinho no WhatsApp (ciclo da demanda)."
      aria-pressed={ligado}
      className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60"
      style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}
    >
      <span
        className="inline-flex h-4 w-7 items-center rounded-full p-0.5 transition-colors"
        style={{ background: ligado ? "#17784F" : "var(--color-border)" }}
        aria-hidden
      >
        <span
          className="h-3 w-3 rounded-full bg-white transition-transform"
          style={{ transform: ligado ? "translateX(12px)" : "translateX(0)" }}
        />
      </span>
      {erro ? "Falhou — tente de novo" : "Avisar cidadão ao resolver"}
    </button>
  );
}
