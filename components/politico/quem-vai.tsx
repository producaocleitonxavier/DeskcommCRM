"use client";

/**
 * "Quem vai" — presença de equipe numa tarefa de campo (visita/obra/evento).
 * VÁRIOS assessores marcam "eu vou" na mesma tarefa; todo o gabinete vê a lista.
 * Incremento 3, Fase 1 (sem WhatsApp).
 */

import { useState } from "react";
import { Check, UserPlus } from "lucide-react";

import {
  marcarPresenca,
  desmarcarPresenca,
  type TarefaKind,
} from "@/app/actions/politico/presenca-actions";

export interface Presente {
  user_id: string;
  nome: string | null;
}

export function QuemVai({
  kind,
  tarefaId,
  usuarioAtualId,
  inicial,
  compacto = false,
}: {
  kind: TarefaKind;
  tarefaId: string;
  usuarioAtualId: string;
  inicial: Presente[];
  /** compacto: só o botão + contagem, sem a lista (para cards densos). */
  compacto?: boolean;
}) {
  const [lista, setLista] = useState<Presente[]>(inicial);
  const [salvando, setSalvando] = useState(false);
  const euVou = lista.some((p) => p.user_id === usuarioAtualId);

  async function alternar() {
    if (salvando) return;
    setSalvando(true);
    const otimista = euVou
      ? lista.filter((p) => p.user_id !== usuarioAtualId)
      : [...lista, { user_id: usuarioAtualId, nome: "Você" }];
    setLista(otimista);
    const r = euVou ? await desmarcarPresenca(kind, tarefaId) : await marcarPresenca(kind, tarefaId);
    if (!r.ok) setLista(lista); // reverte
    setSalvando(false);
  }

  const outros = lista.filter((p) => p.user_id !== usuarioAtualId);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void alternar()}
          disabled={salvando}
          className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors disabled:opacity-60"
          style={
            euVou
              ? { background: "var(--color-accent)", color: "#14181F" }
              : { border: "1px solid var(--color-border)", color: "var(--color-text)", background: "var(--color-surface)" }
          }
          aria-pressed={euVou}
        >
          {euVou ? <Check className="h-4 w-4" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />}
          {euVou ? "Vou nessa" : "Eu vou"}
        </button>
        {lista.length > 0 && (
          <span className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
            {lista.length} {lista.length === 1 ? "confirmado" : "confirmados"}
          </span>
        )}
      </div>

      {!compacto && lista.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {euVou && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{ background: "color-mix(in srgb, var(--color-accent) 16%, transparent)", color: "var(--accent-ink, var(--color-text))" }}
            >
              Você
            </span>
          )}
          {outros.map((p) => (
            <span
              key={p.user_id}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }}
            >
              {p.nome ?? "Assessor"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
