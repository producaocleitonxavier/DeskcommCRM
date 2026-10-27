"use client";

/**
 * Seletor VISUAL de vídeos/posts para a automação (modo allowlist "só nos que eu
 * marcar"). Mostra os posts recentes da conta com a capa; clicar liga/desliga a
 * automação naquele vídeo. Guarda os `media_id` escolhidos — que casam exato no
 * motor. Nada de link nem código: à prova de criança.
 */

import { useEffect, useState } from "react";
import { Check, RefreshCw, ImageOff } from "lucide-react";
import { listarMidiasParaSelecao, type MidiaSelecao } from "@/app/actions/instagram/midias";

function dataCurta(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function legendaCurta(s: string | null): string {
  if (!s) return "Sem legenda";
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 70 ? `${t.slice(0, 70)}…` : t;
}

export default function SeletorPosts({
  selecionados,
  onChange,
}: {
  selecionados: string[];
  onChange: (ids: string[]) => void;
}) {
  const [midias, setMidias] = useState<MidiaSelecao[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    const r = await listarMidiasParaSelecao();
    if (r.ok && r.midias) {
      setMidias(r.midias);
    } else {
      setErro(r.erro ?? "Não consegui carregar seus vídeos.");
      setMidias(null);
    }
    setCarregando(false);
  }

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sel = new Set(selecionados);
  function toggle(id: string) {
    const novo = new Set(sel);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    onChange(Array.from(novo));
  }

  const marcados = midias ? midias.filter((m) => sel.has(m.id)).length : sel.size;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {marcados > 0 ? (
            <>
              <strong style={{ color: "#D7F36A" }}>{marcados}</strong> vídeo{marcados > 1 ? "s" : ""} com automação ligada.
            </>
          ) : (
            <>Clique nos vídeos que terão a automação. Os sensíveis, deixe de fora.</>
          )}
        </p>
        <button
          type="button"
          onClick={() => void carregar()}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors"
          style={{ border: "1px solid var(--color-border)", background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Atualizar
        </button>
      </div>

      {carregando && (
        <div className="flex min-h-[120px] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }} />
        </div>
      )}

      {!carregando && erro && (
        <div className="rounded-[14px] p-4 text-sm" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#F87171" }}>
          {erro}
        </div>
      )}

      {!carregando && !erro && midias && midias.length === 0 && (
        <div className="rounded-[14px] py-8 text-center text-sm" style={{ border: "2px dashed var(--color-border)", color: "var(--color-text-muted)" }}>
          Nenhum post encontrado na conta conectada.
        </div>
      )}

      {!carregando && !erro && midias && midias.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {midias.map((m) => {
            const on = sel.has(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggle(m.id)}
                className="group relative overflow-hidden rounded-[14px] text-left transition-transform hover:scale-[1.01]"
                style={{ border: `2px solid ${on ? "#D7F36A" : "var(--color-border)"}`, background: "var(--color-surface)" }}
                aria-pressed={on}
              >
                <div className="relative aspect-square w-full" style={{ background: "var(--color-surface-elevated)" }}>
                  {m.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.thumb} alt={legendaCurta(m.legenda)} className="h-full w-full object-cover" style={{ opacity: on ? 1 : 0.82 }} />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageOff className="h-6 w-6" style={{ color: "var(--color-text-subtle)" }} aria-hidden />
                    </div>
                  )}
                  {/* check de selecionado */}
                  <span
                    className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full transition-all"
                    style={{
                      background: on ? "#D7F36A" : "rgba(10,12,16,0.6)",
                      border: on ? "none" : "1px solid rgba(255,255,255,0.4)",
                    }}
                  >
                    {on && <Check className="h-4 w-4" style={{ color: "#1B2206" }} aria-hidden />}
                  </span>
                  {/* rótulo ON */}
                  {on && (
                    <span className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "#D7F36A", color: "#1B2206" }}>
                      AUTOMAÇÃO ON
                    </span>
                  )}
                </div>
                <div className="space-y-0.5 p-2.5">
                  <p className="text-[12px] leading-snug" style={{ color: "var(--color-text)" }}>{legendaCurta(m.legenda)}</p>
                  <p className="text-[10px]" style={{ color: "var(--color-text-subtle)" }}>
                    {m.tipo === "VIDEO" ? "🎬 Vídeo" : m.tipo === "CAROUSEL_ALBUM" ? "🖼 Carrossel" : "🖼 Post"} · {dataCurta(m.timestamp)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!carregando && !erro && midias && midias.length > 0 && marcados === 0 && (
        <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
          ⚠️ Nenhum vídeo marcado = a automação <strong>não roda em lugar nenhum</strong>. Marque pelo menos um.
        </p>
      )}
    </div>
  );
}
