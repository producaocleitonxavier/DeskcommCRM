"use client";

/**
 * Marca/desmarca a pessoa como MULTIPLICADOR (tag `multiplicador`) direto da ficha.
 * Marcar = vira ASSESSOR (equipe do gabinete) e já aparece no placar de
 * Multiplicadores. Reusa as ações da tela de Multiplicadores (sem modelo novo).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, UserCheck } from "lucide-react";

import { adicionarMultiplicador, removerMultiplicador } from "@/app/actions/politico/multiplicadores-actions";

export default function MarcarFuncao({
  contactId,
  ehMultiplicador,
  funcao,
}: {
  contactId: string;
  ehMultiplicador: boolean;
  funcao: "assessor" | "divulgador" | null;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function alterar(adicionar: boolean) {
    setErro(null);
    iniciar(async () => {
      const r = adicionar ? await adicionarMultiplicador(contactId) : await removerMultiplicador(contactId);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      router.refresh();
    });
  }

  if (!ehMultiplicador) {
    return (
      <div>
        <button
          type="button"
          onClick={() => alterar(true)}
          disabled={pendente}
          className="wr-btn w-full justify-center disabled:opacity-60"
          title="Marca como equipe do gabinete — passa a aparecer no placar de Multiplicadores"
        >
          <UserPlus style={{ width: 16, height: 16 }} /> {pendente ? "Marcando…" : "Marcar como assessor"}
        </button>
        {erro && <p className="mt-1.5 text-xs" style={{ color: "#EF4444" }}>{erro}</p>}
      </div>
    );
  }

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold"
        style={{ background: "color-mix(in srgb, var(--color-text) 5%, transparent)", color: "var(--color-text)" }}
      >
        <UserCheck style={{ width: 16, height: 16, color: "#17784F" }} />
        {funcao === "divulgador" ? "Divulgador" : "Assessor"} · no placar
      </div>
      <button
        type="button"
        onClick={() => alterar(false)}
        disabled={pendente}
        className="mt-1.5 text-xs underline-offset-2 hover:underline disabled:opacity-60"
        style={{ color: "var(--color-text-subtle)" }}
      >
        {pendente ? "Removendo…" : "Remover do time"}
      </button>
      {erro && <p className="mt-1.5 text-xs" style={{ color: "#EF4444" }}>{erro}</p>}
    </div>
  );
}
