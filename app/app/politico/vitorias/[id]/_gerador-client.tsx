"use client";

/**
 * Gerador "Antes & Depois" — à prova de criança:
 *  1) escolhe a foto do ANTES e a do DEPOIS (ou envia a do depois);
 *  2) a IA escreve a legenda (editável);
 *  3) vê a prévia do card (Stories) e BAIXA a imagem + copia a legenda.
 * Nada envia — é só gerar e baixar (modo assistido / TSE-safe).
 */

import { useCallback, useEffect, useState } from "react";
import { Camera, Check, Copy, Download, Loader2, Sparkles, Upload } from "lucide-react";

import { listarAnexosDemanda } from "@/app/actions/politico/gabinete-actions";
import { uploadAnexoDemanda, ANEXO_MAX_BYTES } from "@/lib/politico/anexos-upload";
import { gerarLegendaVitoria } from "@/app/actions/politico/vitoria-actions";

type Foto = { id: string; url: string; nome: string };
const MIMES_IMAGEM = ["image/jpeg", "image/jpg", "image/png"];

export default function GeradorVitoriaClient({
  demandaId,
  assunto,
  fotosIniciais,
}: {
  demandaId: string;
  assunto: string;
  fotosIniciais: Foto[];
}) {
  const [fotos, setFotos] = useState<Foto[]>(fotosIniciais);
  const [antesId, setAntesId] = useState<string | null>(fotosIniciais[0]?.id ?? null);
  const [depoisId, setDepoisId] = useState<string | null>(fotosIniciais[1]?.id ?? null);
  const [legenda, setLegenda] = useState("");
  const [gerandoLegenda, setGerandoLegenda] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const pronto = !!antesId && !!depoisId;

  const montarUrl = useCallback(
    () =>
      `/app/politico/vitorias/${demandaId}/card?antes=${antesId}&depois=${depoisId}&l=${encodeURIComponent(legenda)}&t=${Date.now()}`,
    [demandaId, antesId, depoisId, legenda],
  );

  // Atualiza a prévia quando as fotos mudam (legenda atualiza no blur / botão).
  useEffect(() => {
    if (antesId && depoisId) setPreviewUrl(montarUrl());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [antesId, depoisId]);

  function escolherAntes(id: string) {
    setErro(null);
    if (depoisId === id) setDepoisId(null);
    setAntesId(id);
  }
  function escolherDepois(id: string) {
    setErro(null);
    if (antesId === id) setAntesId(null);
    setDepoisId(id);
  }

  async function enviarDepois(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    if (!MIMES_IMAGEM.includes(file.type)) {
      setErro("Envie uma foto JPG ou PNG (outros formatos não entram no card).");
      return;
    }
    if (file.size > ANEXO_MAX_BYTES) {
      setErro("A foto passou de 50MB. Use uma menor.");
      return;
    }
    setEnviando(true);
    setErro(null);
    const idsAntigos = new Set(fotos.map((f) => f.id));
    const res = await uploadAnexoDemanda(demandaId, file);
    if (!res.ok) {
      setErro(res.erro || "Não consegui enviar a foto.");
      setEnviando(false);
      return;
    }
    // Re-lista os anexos pra pegar a nova foto (com URL assinada) e já selecioná-la.
    const anexos = await listarAnexosDemanda(demandaId);
    const novas = anexos
      .filter((a) => MIMES_IMAGEM.includes(a.media_mime) && a.url)
      .map((a) => ({ id: a.id, url: a.url as string, nome: a.nome_arquivo }));
    setFotos(novas);
    const nova = novas.find((f) => !idsAntigos.has(f.id));
    if (nova) escolherDepois(nova.id);
    setEnviando(false);
  }

  async function gerarLegenda() {
    setGerandoLegenda(true);
    setErro(null);
    const res = await gerarLegendaVitoria(demandaId);
    setGerandoLegenda(false);
    if (!res.ok) {
      setErro(res.erro);
      return;
    }
    setLegenda(res.legenda);
    if (antesId && depoisId) setPreviewUrl(montarUrl());
  }

  function atualizarPreview() {
    if (antesId && depoisId) setPreviewUrl(montarUrl());
  }

  async function copiarLegenda() {
    try {
      await navigator.clipboard.writeText(legenda);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro("Não consegui copiar — selecione e copie manualmente.");
    }
  }

  function Thumb({ f }: { f: Foto }) {
    const ehAntes = antesId === f.id;
    const ehDepois = depoisId === f.id;
    return (
      <div className="flex flex-col gap-1.5">
        <div
          className="relative h-24 w-24 overflow-hidden rounded-xl"
          style={{ border: ehAntes ? "3px solid #F59E0B" : ehDepois ? "3px solid #16A34A" : "1px solid var(--color-border)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.url} alt={f.nome} className="h-full w-full object-cover" />
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => escolherAntes(f.id)}
            className="flex-1 rounded-md py-1 text-[11px] font-bold"
            style={ehAntes ? { background: "#F59E0B", color: "#231200" } : { background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }}
          >
            Antes
          </button>
          <button
            type="button"
            onClick={() => escolherDepois(f.id)}
            className="flex-1 rounded-md py-1 text-[11px] font-bold"
            style={ehDepois ? { background: "#16A34A", color: "#FFFFFF" } : { background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }}
          >
            Depois
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {erro && (
        <div role="alert" className="rounded-xl px-4 py-3 text-sm font-medium" style={{ background: "#FBE4E2", color: "#A3302A" }}>
          {erro}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        {/* Coluna de montagem */}
        <div className="space-y-5">
          {/* Fotos */}
          <section className="gip-glass p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4" style={{ color: "var(--accent-ink, var(--color-accent))" }} aria-hidden />
              <span className="text-sm font-bold" style={{ color: "var(--color-text)" }}>1 · Escolha as fotos</span>
            </div>
            <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
              Marque uma foto como <strong style={{ color: "#B45309" }}>Antes</strong> e outra como <strong style={{ color: "#15803D" }}>Depois</strong>. Não tem a do depois? Envie agora.
            </p>
            {fotos.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>Esta demanda ainda não tem foto. Envie a do depois abaixo (e a do antes na demanda).</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {fotos.map((f) => <Thumb key={f.id} f={f} />)}
              </div>
            )}
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--accent-ink, var(--color-accent))" }}>
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
              {enviando ? "Enviando…" : "Enviar foto do depois"}
              <input type="file" accept="image/jpeg,image/png" capture="environment" onChange={enviarDepois} className="hidden" disabled={enviando} />
            </label>
          </section>

          {/* Legenda */}
          <section className="gip-glass p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" style={{ color: "var(--accent-ink, var(--color-accent))" }} aria-hidden />
                <span className="text-sm font-bold" style={{ color: "var(--color-text)" }}>2 · Legenda</span>
              </div>
              <button
                type="button"
                onClick={gerarLegenda}
                disabled={gerandoLegenda}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-60"
                style={{ background: "var(--color-accent)", color: "#14181F" }}
              >
                {gerandoLegenda ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
                {gerandoLegenda ? "Escrevendo…" : "Gerar com IA"}
              </button>
            </div>
            <textarea
              value={legenda}
              onChange={(e) => setLegenda(e.target.value)}
              onBlur={atualizarPreview}
              rows={4}
              placeholder={`Ex.: ${assunto} — resolvido junto ao órgão responsável. Trabalho do gabinete pela comunidade.`}
              className="wr-input w-full"
            />
            <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
              A IA escreve factual, sem promessa (lei eleitoral). Você edita como quiser — nada é publicado por aqui.
            </p>
          </section>
        </div>

        {/* Prévia do card */}
        <section className="gip-glass p-5 space-y-3">
          <span className="text-sm font-bold" style={{ color: "var(--color-text)" }}>3 · Prévia (Stories)</span>
          {pronto && previewUrl ? (
            <>
              <div className="mx-auto overflow-hidden rounded-2xl" style={{ width: 270, border: "1px solid var(--color-border)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Prévia do card" style={{ width: 270, height: 480, display: "block" }} />
              </div>
              <div className="flex flex-col gap-2">
                <a
                  href={previewUrl}
                  download={`vitoria-${demandaId}.png`}
                  className="wr-btn-dark inline-flex items-center justify-center gap-2 py-2.5"
                >
                  <Download className="h-4 w-4" aria-hidden /> Baixar imagem
                </a>
                <button type="button" onClick={copiarLegenda} disabled={!legenda} className="wr-btn inline-flex items-center justify-center gap-2 disabled:opacity-60">
                  {copiado ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                  {copiado ? "Legenda copiada!" : "Copiar legenda"}
                </button>
                <button type="button" onClick={atualizarPreview} className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
                  Atualizar prévia
                </button>
              </div>
            </>
          ) : (
            <div className="flex h-[480px] flex-col items-center justify-center rounded-2xl text-center" style={{ background: "var(--color-surface-elevated)", border: "1px dashed var(--color-border)" }}>
              <Camera className="mb-2 h-8 w-8" style={{ color: "var(--color-text-subtle)" }} aria-hidden />
              <p className="px-4 text-sm" style={{ color: "var(--color-text-subtle)" }}>
                Escolha a foto do <strong>Antes</strong> e a do <strong>Depois</strong> pra ver o card aqui.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
