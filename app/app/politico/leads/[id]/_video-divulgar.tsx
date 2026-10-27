"use client";

/**
 * "Vídeo pra divulgar" — na ficha do contato. Gera o link PESSOAL deste
 * multiplicador para um vídeo da biblioteca (via gerarLinkDeVideo): quando ele
 * compartilha e as pessoas clicam, o alcance é creditado a ELE ("alcançou Y" nos
 * Multiplicadores). Copia o link ou abre o WhatsApp dele já com a mensagem.
 */

import { useState } from "react";
import { Check, Copy, MessageCircle, Video } from "lucide-react";

import { gerarLinkDeVideo } from "@/app/actions/politico/video-share-actions";

export interface VideoItem {
  id: string;
  titulo: string;
}

export default function VideoDivulgar({
  contactId,
  whatsDigits,
  videos,
}: {
  contactId: string;
  whatsDigits: string;
  videos: VideoItem[];
}) {
  const [selId, setSelId] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (videos.length === 0) return null;

  async function gerar(materialId: string) {
    setSelId(materialId);
    setLink(null);
    setErro(null);
    setCopiado(false);
    setCarregando(true);
    const r = await gerarLinkDeVideo(materialId, contactId);
    setCarregando(false);
    if (r.ok) setLink(r.url);
    else setErro(r.erro);
  }

  async function copiar() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      setErro("Não consegui copiar — selecione e copie o link manualmente.");
    }
  }

  const msgWhats = link
    ? `https://wa.me/${whatsDigits}?text=${encodeURIComponent(`Oi! Compartilha esse vídeo com a galera 👇\n${link}`)}`
    : null;

  return (
    <div className="wr-card p-5">
      <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.08em]" style={{ color: "var(--color-text-subtle)" }}>
        <Video className="h-3.5 w-3.5" aria-hidden /> Vídeo pra divulgar
      </h3>
      <p className="mb-3 text-xs" style={{ color: "var(--color-text-muted)" }}>
        Link pessoal desta pessoa — o alcance dela é contado quando compartilha.
      </p>

      <div className="flex flex-col gap-1.5">
        {videos.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => gerar(v.id)}
            disabled={carregando && selId === v.id}
            className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:opacity-60"
            style={{
              background: selId === v.id ? "rgba(215,243,106,0.12)" : "var(--color-surface-elevated)",
              color: "var(--color-text)",
            }}
          >
            <span className="min-w-0 truncate">{v.titulo}</span>
            <span className="shrink-0 text-xs" style={{ color: "var(--color-accent)" }}>
              {carregando && selId === v.id ? "…" : selId === v.id && link ? "ok" : "gerar"}
            </span>
          </button>
        ))}
      </div>

      {erro && <p className="mt-2 text-xs" style={{ color: "#e2726a" }}>{erro}</p>}

      {link && (
        <div className="mt-3 space-y-2">
          <input
            type="text"
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="wr-input w-full font-mono text-xs"
          />
          <div className="flex gap-2">
            <button type="button" onClick={copiar} className="wr-btn inline-flex flex-1 items-center justify-center gap-1.5">
              {copiado ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              {copiado ? "Copiado" : "Copiar"}
            </button>
            {msgWhats && (
              <a href={msgWhats} target="_blank" rel="noopener noreferrer" className="wr-btn-dark inline-flex flex-1 items-center justify-center gap-1.5">
                <MessageCircle className="h-4 w-4" aria-hidden /> Enviar
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
