"use client";

/**
 * Seção de anexos de uma demanda (Gabinete). Lista os arquivos/fotos com
 * download por URL assinada, permite anexar novos (upload multipart) e remover.
 * Carrega a lista por server action — o bucket é privado e a URL é temporária.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, ImageIcon, Download, Trash2, Paperclip, Loader2 } from "lucide-react";

import {
  listarAnexosDemanda,
  removerAnexoDemanda,
  type AnexoDemanda,
} from "@/app/actions/politico/gabinete-actions";
import { uploadAnexoDemanda, formatarBytes, ANEXO_MAX_BYTES } from "@/lib/politico/anexos-upload";

function ehImagem(mime: string): boolean {
  return mime.startsWith("image/");
}

export default function DemandaAnexos({ demandaId, refreshToken = 0 }: { demandaId: string; refreshToken?: number }) {
  const [anexos, setAnexos] = useState<AnexoDemanda[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const recarregar = useCallback(async () => {
    const lista = await listarAnexosDemanda(demandaId);
    setAnexos(lista);
    setCarregando(false);
  }, [demandaId]);

  useEffect(() => {
    void recarregar();
  }, [recarregar, refreshToken]);

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? []);
    if (inputRef.current) inputRef.current.value = "";
    if (arquivos.length === 0) return;
    setErro(null);
    setEnviando(true);
    for (const f of arquivos) {
      if (f.size > ANEXO_MAX_BYTES) {
        setErro(`"${f.name}" passa de 50MB.`);
        continue;
      }
      const res = await uploadAnexoDemanda(demandaId, f);
      if (!res.ok) setErro(res.erro ?? "Falha ao enviar.");
    }
    await recarregar();
    setEnviando(false);
  }

  async function remover(id: string) {
    setErro(null);
    setRemovendo(id);
    const res = await removerAnexoDemanda(id);
    if (!res.ok) setErro(res.erro);
    else setAnexos((prev) => prev.filter((a) => a.id !== id));
    setRemovendo(null);
  }

  return (
    <section className="wr-card p-6 sm:p-7">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>
          Anexos
          {anexos.length > 0 && (
            <span className="ml-2 text-sm font-medium" style={{ color: "var(--color-text-subtle)" }}>
              {anexos.length}
            </span>
          )}
        </h2>
        <button
          type="button"
          disabled={enviando}
          onClick={() => inputRef.current?.click()}
          className="wr-btn inline-flex items-center gap-1.5 disabled:opacity-60"
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Paperclip className="h-4 w-4" aria-hidden />}
          {enviando ? "Enviando…" : "Anexar arquivo"}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={aoEscolher}
          className="hidden"
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
        />
      </div>

      {erro && (
        <div role="alert" className="mb-3 rounded-xl px-4 py-3 text-sm" style={{ background: "#FBE4E2", color: "#A3302A" }}>
          {erro}
        </div>
      )}

      {carregando ? (
        <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>Carregando anexos…</p>
      ) : anexos.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>
          Nenhum anexo. Anexe ofícios, fotos do problema ou documentos (até 50MB cada).
        </p>
      ) : (
        <ul className="space-y-2">
          {anexos.map((a) => {
            const img = ehImagem(a.media_mime);
            return (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}
              >
                {img && a.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.url}
                    alt={a.nome_arquivo}
                    className="h-11 w-11 shrink-0 rounded-lg object-cover"
                    style={{ border: "1px solid var(--color-border)" }}
                  />
                ) : (
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "rgba(215,243,106,0.12)", color: "#D7F36A" }}
                    aria-hidden
                  >
                    {img ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium" style={{ color: "var(--color-text)" }}>
                    {a.nome_arquivo}
                  </div>
                  <div className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
                    {formatarBytes(a.media_size_bytes)}
                  </div>
                </div>
                {a.url && (
                  <a
                    href={a.url}
                    download={a.nome_arquivo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--color-surface)]"
                    style={{ color: "var(--color-text-muted)" }}
                    aria-label={`Baixar ${a.nome_arquivo}`}
                  >
                    <Download className="h-4 w-4" aria-hidden />
                  </a>
                )}
                <button
                  type="button"
                  disabled={removendo === a.id}
                  onClick={() => remover(a.id)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[rgba(239,68,68,0.12)] disabled:opacity-50"
                  style={{ color: "#EF4444" }}
                  aria-label={`Remover ${a.nome_arquivo}`}
                >
                  {removendo === a.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
