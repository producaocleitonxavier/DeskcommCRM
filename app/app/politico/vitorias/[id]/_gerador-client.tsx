"use client";

/**
 * Vitória "Antes & Depois" — MATERIAL PRA COMUNICAÇÃO (não faz a arte).
 * Decisão do cliente (10/nov): a identidade/arte é do gabinete. A ferramenta
 * organiza o material e ENTREGA: escolhe Antes/Depois, sugere a legenda (IA) e
 * BAIXA as fotos em boa qualidade. A comunicação baixa e monta a arte na moldura
 * de vocês. Nada é composto/publicado aqui.
 */

import { useState } from "react";
import { Camera, Check, Copy, Download, Loader2, Sparkles, Upload } from "lucide-react";

import { BannerAvisoTse, useAvisoTse } from "@/components/politico/aviso-tse";
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
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // A legenda vai a público (Stories) — advertência TSE (Lei 9.504) ao vivo.
  const avisoTse = useAvisoTse(legenda);

  const antes = fotos.find((f) => f.id === antesId) ?? null;
  const depois = fotos.find((f) => f.id === depoisId) ?? null;

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
    if (!MIMES_IMAGEM.includes(file.type)) return setErro("Envie uma foto JPG ou PNG.");
    if (file.size > ANEXO_MAX_BYTES) return setErro("A foto passou de 50MB. Use uma menor.");
    setEnviando(true);
    setErro(null);
    const idsAntigos = new Set(fotos.map((f) => f.id));
    const res = await uploadAnexoDemanda(demandaId, file);
    if (!res.ok) {
      setErro(res.erro || "Não consegui enviar a foto.");
      setEnviando(false);
      return;
    }
    const anexos = await listarAnexosDemanda(demandaId);
    const novas = anexos.filter((a) => MIMES_IMAGEM.includes(a.media_mime) && a.url).map((a) => ({ id: a.id, url: a.url as string, nome: a.nome_arquivo }));
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
    if (!res.ok) return setErro(res.erro);
    setLegenda(res.legenda);
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

  async function baixar(foto: Foto | null, nome: string) {
    if (!foto) return;
    try {
      const r = await fetch(foto.url);
      const b = await r.blob();
      const u = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = u;
      a.download = nome;
      a.click();
      URL.revokeObjectURL(u);
    } catch {
      window.open(foto.url, "_blank");
    }
  }

  function Thumb({ f }: { f: Foto }) {
    const ehAntes = antesId === f.id;
    const ehDepois = depoisId === f.id;
    return (
      <div className="flex flex-col gap-1.5">
        <div className="h-24 w-24 overflow-hidden rounded-xl" style={{ border: ehAntes ? "3px solid #F59E0B" : ehDepois ? "3px solid #16A34A" : "1px solid var(--color-border)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.url} alt={f.nome} className="h-full w-full object-cover" />
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={() => escolherAntes(f.id)} className="flex-1 rounded-md py-1 text-[11px] font-bold" style={ehAntes ? { background: "#F59E0B", color: "#231200" } : { background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }}>Antes</button>
          <button type="button" onClick={() => escolherDepois(f.id)} className="flex-1 rounded-md py-1 text-[11px] font-bold" style={ehDepois ? { background: "#16A34A", color: "#FFFFFF" } : { background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }}>Depois</button>
        </div>
      </div>
    );
  }

  const pronto = !!antes && !!depois;

  return (
    <div className="space-y-5">
      <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "color-mix(in srgb, var(--color-accent) 10%, var(--color-surface))", border: "1px solid color-mix(in srgb, var(--color-accent) 28%, transparent)", color: "var(--color-text-muted)" }}>
        Aqui você <strong style={{ color: "var(--color-text)" }}>organiza o material</strong> da vitória. A comunicação de vocês baixa as fotos e a legenda e monta a arte na moldura do mandato.
      </div>
      {erro && <div role="alert" className="rounded-xl px-4 py-3 text-sm font-medium" style={{ background: "#FBE4E2", color: "#A3302A" }}>{erro}</div>}

      {/* 1 · Fotos */}
      <section className="gip-glass p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4" style={{ color: "var(--accent-ink, var(--color-accent))" }} aria-hidden />
          <span className="text-sm font-bold" style={{ color: "var(--color-text)" }}>1 · Marque o Antes e o Depois</span>
        </div>
        <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
          Marque uma foto como <strong style={{ color: "#B45309" }}>Antes</strong> e outra como <strong style={{ color: "#15803D" }}>Depois</strong>. Não tem a do depois? Envie agora.
        </p>
        {fotos.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>Esta demanda ainda não tem foto. Envie a do depois abaixo.</p>
        ) : (
          <div className="flex flex-wrap gap-3">{fotos.map((f) => <Thumb key={f.id} f={f} />)}</div>
        )}
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--accent-ink, var(--color-accent))" }}>
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
          {enviando ? "Enviando…" : "Enviar foto do depois"}
          <input type="file" accept="image/jpeg,image/png" capture="environment" onChange={enviarDepois} className="hidden" disabled={enviando} />
        </label>
      </section>

      {/* 2 · Legenda */}
      <section className="gip-glass p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" style={{ color: "var(--accent-ink, var(--color-accent))" }} aria-hidden />
            <span className="text-sm font-bold" style={{ color: "var(--color-text)" }}>2 · Legenda sugerida</span>
          </div>
          <button type="button" onClick={gerarLegenda} disabled={gerandoLegenda} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-60" style={{ background: "var(--color-accent)", color: "#14181F" }}>
            {gerandoLegenda ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
            {gerandoLegenda ? "Escrevendo…" : "Gerar com IA"}
          </button>
        </div>
        <textarea value={legenda} onChange={(e) => setLegenda(e.target.value)} rows={4} placeholder={`Ex.: ${assunto} — resolvido junto ao órgão responsável. Trabalho do gabinete pela comunidade.`} className="wr-input w-full" />
        <BannerAvisoTse aviso={avisoTse} />
        <button type="button" onClick={copiarLegenda} disabled={!legenda} className="wr-btn inline-flex items-center gap-2 disabled:opacity-60">
          {copiado ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copiado ? "Copiada!" : "Copiar legenda"}
        </button>
        <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Factual, sem promessa (lei eleitoral). Edite como quiser — cole ao postar.</p>
      </section>

      {/* 3 · Baixar o material */}
      <section className="gip-glass p-5 space-y-4">
        <span className="text-sm font-bold" style={{ color: "var(--color-text)" }}>3 · Baixar o material</span>
        {pronto ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              {[
                { foto: antes, rot: "ANTES", cor: "#B45309", nome: `antes-${demandaId}.jpg` },
                { foto: depois, rot: "DEPOIS", cor: "#15803D", nome: `depois-${demandaId}.jpg` },
              ].map((p) => (
                <div key={p.rot} className="flex flex-col gap-2">
                  <div className="overflow-hidden rounded-xl" style={{ border: `2px solid ${p.cor}` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.foto!.url} alt={p.rot} className="aspect-square w-full object-cover" />
                  </div>
                  <span className="text-center text-xs font-bold" style={{ color: p.cor }}>{p.rot}</span>
                  <button type="button" onClick={() => baixar(p.foto, p.nome)} className="wr-btn inline-flex items-center justify-center gap-1.5">
                    <Download className="h-4 w-4" aria-hidden /> Baixar
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={async () => { await baixar(antes, `antes-${demandaId}.jpg`); await baixar(depois, `depois-${demandaId}.jpg`); }}
              className="wr-btn-dark inline-flex w-full items-center justify-center gap-2 py-2.5"
            >
              <Download className="h-4 w-4" aria-hidden /> Baixar as duas fotos
            </button>
            <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
              A comunicação baixa as fotos (e copia a legenda) e monta a arte Antes & Depois na moldura de vocês.
            </p>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl py-12 text-center" style={{ background: "var(--color-surface-elevated)", border: "1px dashed var(--color-border)" }}>
            <Camera className="mb-2 h-8 w-8" style={{ color: "var(--color-text-subtle)" }} aria-hidden />
            <p className="px-4 text-sm" style={{ color: "var(--color-text-subtle)" }}>Marque o <strong>Antes</strong> e o <strong>Depois</strong> pra liberar o download.</p>
          </div>
        )}
      </section>
    </div>
  );
}
