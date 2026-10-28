"use client";

/**
 * BotaoRecadoVoz — componente ÚNICO e reutilizável pra mandar uma nota de voz na
 * voz do político pra qualquer pessoa (cidadão, liderança, beneficiário). Vive em
 * Demandas, Lideranças, Emendas e Obras — a voz "viaja" pro ponto de contato, em
 * vez de o operador ter que ir até a Voz do Mandato.
 *
 * Só aparece quando a Voz do Mandato está LIGADA (`vozArmada`): a config fica no
 * lugar dela; aqui é só o uso. As travas (consentimento, aviso de IA, silêncio de
 * 72h) estão na server action `mandarRecadoDeVoz`.
 */

import { useState, useTransition } from "react";
import { Mic, Loader2, X, Send, Check } from "lucide-react";
import { mandarRecadoDeVoz } from "@/app/actions/politico/voz";

export function BotaoRecadoVoz({
  contactId,
  nome,
  vozArmada,
  politico = "o vereador",
  compacto = false,
}: {
  contactId: string;
  nome?: string | null;
  vozArmada?: boolean;
  politico?: string;
  compacto?: boolean;
}) {
  const primeiro = (nome ?? "").trim().split(/\s+/)[0] ?? "";
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState(
    primeiro ? `Olá, ${primeiro}! Aqui é ${politico}. ` : `Olá! Aqui é ${politico}. `,
  );
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pending, start] = useTransition();

  // Config fica na Voz do Mandato — sem ela ligada, o botão nem aparece.
  if (!vozArmada) return null;

  function enviar() {
    setMsg(null);
    start(async () => {
      const r = await mandarRecadoDeVoz(contactId, texto);
      if (r.ok) {
        setMsg({ tipo: "ok", texto: "Recado em áudio enviado!" });
        setTimeout(() => {
          setAberto(false);
          setMsg(null);
        }, 1400);
      } else {
        setMsg({ tipo: "erro", texto: r.erro ?? "Falha ao enviar." });
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        title="Mandar recado em áudio na voz do político"
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-transform hover:scale-[1.02]"
        style={{ border: "1px solid rgba(215,243,106,0.4)", background: "rgba(215,243,106,0.1)", color: "#D7F36A" }}
      >
        <Mic className="h-3.5 w-3.5" aria-hidden /> {compacto ? "Áudio" : "Recado em áudio"}
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => !pending && setAberto(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-5"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>
                <Mic className="h-4 w-4" style={{ color: "#D7F36A" }} aria-hidden /> Recado na voz{primeiro ? ` para ${primeiro}` : ""}
              </h3>
              <button type="button" onClick={() => !pending && setAberto(false)} className="rounded-full p-1" style={{ color: "var(--color-text-subtle)" }} aria-label="Fechar">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={4}
              className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
              style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            />
            <p className="mt-1.5 text-xs" style={{ color: "var(--color-text-subtle)" }}>
              Escreva o que o político vai dizer. O aviso de que usa IA entra sozinho no fim.
            </p>
            {msg && (
              <div
                className="mt-2 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm"
                style={{ background: msg.tipo === "ok" ? "rgba(215,243,106,0.14)" : "rgba(239,68,68,0.14)", color: msg.tipo === "ok" ? "#D7F36A" : "#F87171" }}
              >
                {msg.tipo === "ok" && <Check className="h-4 w-4" aria-hidden />} {msg.texto}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => !pending && setAberto(false)} className="wr-btn">Cancelar</button>
              <button
                type="button"
                onClick={enviar}
                disabled={pending || !texto.trim()}
                className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold disabled:opacity-60"
                style={{ background: "#D7F36A", color: "#1B2206" }}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />} Enviar na voz
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
