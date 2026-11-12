"use client";

/**
 * Faixa "Avisos do Instagram" na tela do canal: diz, em português, se o
 * Instagram está AVISANDO o sistema quando alguém comenta ou manda mensagem — e
 * liga com um clique. Sem os avisos, a automação fica "ativa" e nada acontece.
 */
import { useEffect, useState, useTransition } from "react";
import { BellRing, BellOff, Loader2 } from "lucide-react";

import { lerAvisosDoInstagram, ligarAvisosDoInstagram, type EstadoDosAvisos } from "@/app/actions/instagram/avisos";

export function AvisosDoInstagram() {
  const [estado, setEstado] = useState<EstadoDosAvisos | null>(null);
  const [ligando, iniciar] = useTransition();

  useEffect(() => {
    let vivo = true;
    void lerAvisosDoInstagram().then((e) => { if (vivo) setEstado(e); }).catch(() => { if (vivo) setEstado({ ok: false, erro: "Não consegui consultar a Meta agora." }); });
    return () => { vivo = false; };
  }, []);

  const ligados = estado?.ok === true && estado.ligados;

  return (
    <section
      className="gip-glass flex flex-wrap items-center justify-between gap-3 px-5 py-4"
      role="status"
      style={ligados ? undefined : { border: "1px solid rgba(245,158,11,0.5)" }}
    >
      <div className="flex min-w-0 items-start gap-3">
        {estado === null ? (
          <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin" aria-hidden style={{ color: "var(--color-text-subtle)" }} />
        ) : ligados ? (
          <BellRing className="mt-0.5 h-5 w-5 shrink-0" aria-hidden style={{ color: "#22C55E" }} />
        ) : (
          <BellOff className="mt-0.5 h-5 w-5 shrink-0" aria-hidden style={{ color: "#F59E0B" }} />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            {estado === null
              ? "Conferindo os avisos do Instagram…"
              : ligados
                ? "Avisos do Instagram ligados"
                : "Avisos do Instagram desligados"}
          </p>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {estado === null
              ? "Perguntando à Meta se esta conta avisa o sistema."
              : estado.ok === false
                ? estado.erro
                : ligados
                  ? "O Instagram avisa o sistema quando alguém comenta ou manda mensagem."
                  : "O Instagram ainda não avisa o sistema quando alguém comenta ou manda mensagem. Sem isso a automação fica ativa, mas nada chega."}
          </p>
        </div>
      </div>
      {estado !== null && !ligados && (
        <button
          type="button"
          disabled={ligando}
          onClick={() => iniciar(async () => setEstado(await ligarAvisosDoInstagram()))}
          className="wr-btn-dark inline-flex items-center gap-2 disabled:opacity-60"
        >
          {ligando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <BellRing className="h-4 w-4" aria-hidden />}
          {ligando ? "Ligando…" : "Ligar avisos"}
        </button>
      )}
    </section>
  );
}

export default AvisosDoInstagram;
