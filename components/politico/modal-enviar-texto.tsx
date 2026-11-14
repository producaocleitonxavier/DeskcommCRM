"use client";

/**
 * ModalEnviarTexto — o padrão "abre uma janela, revisa/edita o texto, envia".
 *
 * Nasceu do feedback: os avisos ao cidadão (cuidado, cobrança, aviso) saíam no
 * CLIQUE, com o texto automático e sem o assessor poder ler/ajustar — "dá pra
 * ver que é automática". Modo assistido DE VERDADE é o humano ver as palavras
 * antes de sair, como já era no Recado de Voz (`botao-recado-voz.tsx`). Este é o
 * mesmo padrão, para TEXTO: pré-preenche a sugestão, o assessor edita (quebra
 * parágrafo, encurta, ajusta o tom) e só então envia.
 */
import { useMemo, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { Loader2, X, Send, Check } from "lucide-react";

import { BannerAvisoTse, useAvisoTse } from "@/components/politico/aviso-tse";
import { bloqueioDeTextoHumano } from "@/lib/politico/trava-de-texto-humano";

export interface ModalEnviarTextoProps {
  /** Conteúdo do botão que abre o modal (ícone + rótulo). */
  botao: ReactNode;
  /** Estilo do botão (cor própria de cada ação). */
  botaoStyle?: CSSProperties;
  botaoTitle?: string;
  botaoDisabled?: boolean;
  /** Cabeçalho do modal (ex.: "Avisar que estamos cobrando · Leonardo"). */
  titulo: string;
  /** Texto sugerido, já pré-preenchido e editável. */
  textoSugerido: string;
  /** Dica embaixo do campo. */
  dica?: string;
  /** Aviso em destaque (ex.: saúde = sensível). */
  avisoSensivel?: string | null;
  /** Rótulo do botão de envio (ex.: "Enviar cuidado"). */
  rotuloEnviar?: string;
  /** Faz o envio com o texto EDITADO. Devolve ok/erro/sucesso. */
  onEnviar: (texto: string) => Promise<{ ok: boolean; erro?: string; sucesso?: string }>;
}

export function ModalEnviarTexto({
  botao,
  botaoStyle,
  botaoTitle,
  botaoDisabled,
  titulo,
  textoSugerido,
  dica,
  avisoSensivel,
  rotuloEnviar = "Enviar",
  onEnviar,
}: ModalEnviarTextoProps) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState(textoSugerido);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pending, start] = useTransition();
  // Advertência TSE recalculada a cada edição do texto (detector puro, no cliente).
  const avisoTse = useAvisoTse(texto);
  // Troca por voto não é advertência: é bloqueio (o servidor recusa do mesmo jeito).
  const bloqueio = useMemo(() => bloqueioDeTextoHumano(texto), [texto]);

  function abrir() {
    // Reabrir sempre parte da sugestão fresca (demanda pode ter mudado).
    setTexto(textoSugerido);
    setMsg(null);
    setAberto(true);
  }

  function enviar() {
    setMsg(null);
    start(async () => {
      const r = await onEnviar(texto);
      if (r.ok) {
        setMsg({ tipo: "ok", texto: r.sucesso ?? "Enviado!" });
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
        onClick={abrir}
        disabled={botaoDisabled}
        title={botaoTitle}
        className="wr-btn inline-flex items-center gap-1.5 font-semibold disabled:opacity-50"
        style={botaoStyle}
      >
        {botao}
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
              <h3 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>
                {titulo}
              </h3>
              <button type="button" onClick={() => !pending && setAberto(false)} className="rounded-full p-1" style={{ color: "var(--color-text-subtle)" }} aria-label="Fechar">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {avisoSensivel && (
              <p className="mb-2 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: "rgba(245,158,11,0.14)", color: "#B45309" }}>
                {avisoSensivel}
              </p>
            )}

            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={7}
              className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
              style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            />
            {dica && (
              <p className="mt-1.5 text-xs" style={{ color: "var(--color-text-subtle)" }}>
                {dica}
              </p>
            )}

            <BannerAvisoTse aviso={bloqueio ?? avisoTse} className="mt-2" />

            {msg && (
              <div
                className="mt-2 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm"
                style={{ background: msg.tipo === "ok" ? "rgba(16,185,129,0.14)" : "rgba(239,68,68,0.14)", color: msg.tipo === "ok" ? "#0E8A5F" : "#F87171" }}
              >
                {msg.tipo === "ok" && <Check className="h-4 w-4" aria-hidden />} {msg.texto}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => !pending && setAberto(false)} className="wr-btn">Cancelar</button>
              <button
                type="button"
                onClick={enviar}
                disabled={pending || !texto.trim() || !!bloqueio}
                className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold disabled:opacity-60"
                style={{ background: "var(--color-accent)", color: "#14181F" }}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />} {avisoTse ? "Enviar assim mesmo" : rotuloEnviar}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
