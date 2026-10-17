"use client";

/**
 * Identidade do gabinete — timbre dos ofícios. Edita nome do parlamentar,
 * cargo, subtítulo e cidade de emissão, e sobe logo + assinatura (imagens no
 * bucket privado). Grava via server actions; upload pela rota multipart.
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Trash2, Upload, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";

import {
  salvarIdentidade,
  removerImagemIdentidade,
  type IdentidadeGabinete,
} from "@/app/actions/politico/gabinete-identidade";

function Campo({ label, children, dica }: { label: string; children: React.ReactNode; dica?: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--color-text)" }}>{label}</label>
      {children}
      {dica && <p className="mt-1 text-xs" style={{ color: "var(--color-text-subtle)" }}>{dica}</p>}
    </div>
  );
}

export default function IdentidadeClient({ inicial }: { inicial: IdentidadeGabinete }) {
  const router = useRouter();

  const [nome, setNome] = useState(inicial.nome_parlamentar ?? "");
  const [cargo, setCargo] = useState(inicial.cargo ?? "");
  const [subtitulo, setSubtitulo] = useState(inicial.subtitulo ?? "");
  const [cidade, setCidade] = useState(inicial.cidade ?? "");
  const [logoUrl, setLogoUrl] = useState(inicial.logoUrl);
  const [assinaturaUrl, setAssinaturaUrl] = useState(inicial.assinaturaUrl);
  const [timbradoUrl, setTimbradoUrl] = useState(inicial.timbradoUrl);

  const [salvando, setSalvando] = useState(false);
  const [okMsg, setOkMsg] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<"logo" | "assinatura" | "timbrado" | null>(null);

  const logoRef = useRef<HTMLInputElement>(null);
  const assinaturaRef = useRef<HTMLInputElement>(null);
  const timbradoRef = useRef<HTMLInputElement>(null);

  async function salvar() {
    setErro(null);
    setOkMsg(false);
    setSalvando(true);
    const res = await salvarIdentidade({ nome_parlamentar: nome, cargo, subtitulo, cidade });
    setSalvando(false);
    if (!res.ok) return setErro(res.erro);
    setOkMsg(true);
    router.refresh();
  }

  async function enviarImagem(campo: "logo" | "assinatura" | "timbrado", file: File) {
    setErro(null);
    setEnviando(campo);
    const fd = new FormData();
    fd.append("campo", campo);
    fd.append("file", file);
    let url: string | null = null;
    try {
      const res = await fetch("/api/v1/politico/gabinete/identidade", { method: "POST", body: fd });
      if (!res.ok) {
        let msg = "Falha ao enviar a imagem.";
        try {
          const j = (await res.json()) as { error?: { message?: string } };
          if (j?.error?.message) msg = j.error.message;
        } catch { /* corpo não-JSON */ }
        setErro(msg);
      } else {
        // Mostra a imagem na hora (preview local; a URL assinada vem no próximo refresh).
        url = URL.createObjectURL(file);
      }
    } catch {
      setErro("Falha de rede ao enviar a imagem.");
    }
    setEnviando(null);
    if (url) {
      if (campo === "logo") setLogoUrl(url);
      else if (campo === "assinatura") setAssinaturaUrl(url);
      else setTimbradoUrl(url);
      router.refresh();
    }
  }

  async function remover(campo: "logo" | "assinatura" | "timbrado") {
    setErro(null);
    const res = await removerImagemIdentidade(campo);
    if (!res.ok) return setErro(res.erro);
    if (campo === "logo") setLogoUrl(null);
    else if (campo === "assinatura") setAssinaturaUrl(null);
    else setTimbradoUrl(null);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-[760px] px-4 py-7 space-y-5" style={{ background: "var(--color-bg)" }}>
      <div>
        <Link href="/app/politico/demandas" className="inline-flex items-center gap-1 text-sm transition-colors" style={{ color: "var(--color-text-muted)" }}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Gabinete
        </Link>
        <h1 className="mt-3 font-heading text-3xl font-bold leading-tight">Identidade do gabinete</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
          Logo, assinatura e dados do parlamentar que entram no timbre dos ofícios gerados.
        </p>
      </div>

      {erro && <div role="alert" className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FBE4E2", color: "#A3302A" }}>{erro}</div>}
      {okMsg && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(34,197,94,0.14)", color: "#22C55E" }}>Identidade salva.</div>}

      {/* Dados do parlamentar */}
      <section className="wr-card space-y-4 p-5 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label="Nome do parlamentar" dica="Ex.: Dep. Mauro Tramonte">
            <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} className="wr-input w-full" placeholder="Nome que aparece no timbre" />
          </Campo>
          <Campo label="Cargo" dica="Ex.: Deputado Estadual">
            <input type="text" value={cargo} onChange={(e) => setCargo(e.target.value)} className="wr-input w-full" placeholder="Cargo na assinatura" />
          </Campo>
          <Campo label="Subtítulo" dica="Ex.: Trabalhando por Minas Gerais">
            <input type="text" value={subtitulo} onChange={(e) => setSubtitulo(e.target.value)} className="wr-input w-full" placeholder="Linha de apoio no cabeçalho" />
          </Campo>
          <Campo label="Cidade de emissão" dica="Entra na data do ofício. Ex.: Belo Horizonte">
            <input type="text" value={cidade} onChange={(e) => setCidade(e.target.value)} className="wr-input w-full" placeholder="Cidade" />
          </Campo>
        </div>
        <div>
          <button type="button" disabled={salvando} onClick={salvar} className="wr-btn-dark inline-flex items-center gap-2 disabled:opacity-60">
            <Check className="h-4 w-4" aria-hidden /> {salvando ? "Salvando…" : "Salvar dados"}
          </button>
        </div>
      </section>

      {/* Imagens */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <ImagemCard
          titulo="Logo / timbre"
          dica="PNG com fundo transparente fica melhor no cabeçalho."
          url={logoUrl}
          enviando={enviando === "logo"}
          inputRef={logoRef}
          onEscolher={(f) => enviarImagem("logo", f)}
          onRemover={() => remover("logo")}
          alturaPreview={56}
        />
        <ImagemCard
          titulo="Assinatura"
          dica="Imagem da assinatura (PNG transparente), aparece acima do nome."
          url={assinaturaUrl}
          enviando={enviando === "assinatura"}
          inputRef={assinaturaRef}
          onEscolher={(f) => enviarImagem("assinatura", f)}
          onRemover={() => remover("assinatura")}
          alturaPreview={56}
        />
      </div>

      {/* Papel timbrado (A4) — fundo de página do ofício */}
      <ImagemCard
        titulo="Papel timbrado (opcional)"
        dica="Imagem A4 do timbrado pronto do gabinete (PNG/JPG, retrato). Quando houver, o ofício usa essa folha como fundo e sobrepõe só o texto — o cabeçalho e o rodapé passam a vir do seu timbrado, não do gerado."
        url={timbradoUrl}
        enviando={enviando === "timbrado"}
        inputRef={timbradoRef}
        onEscolher={(f) => enviarImagem("timbrado", f)}
        onRemover={() => remover("timbrado")}
        alturaPreview={300}
      />
    </div>
  );
}

function ImagemCard({
  titulo, dica, url, enviando, inputRef, onEscolher, onRemover, alturaPreview,
}: {
  titulo: string;
  dica: string;
  url: string | null;
  enviando: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onEscolher: (f: File) => void;
  onRemover: () => void;
  alturaPreview: number;
}) {
  return (
    <section className="wr-card space-y-3 p-5 sm:p-6">
      <div>
        <h2 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>{titulo}</h2>
        <p className="mt-0.5 text-xs" style={{ color: "var(--color-text-subtle)" }}>{dica}</p>
      </div>
      <div
        className="flex items-center justify-center rounded-xl p-3"
        style={{ background: "var(--color-surface-elevated)", border: "1px dashed var(--color-border)", minHeight: alturaPreview + 24 }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={titulo} style={{ maxHeight: alturaPreview, maxWidth: "100%", objectFit: "contain" }} />
        ) : (
          <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Nenhuma imagem</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" disabled={enviando} onClick={() => inputRef.current?.click()} className="wr-btn inline-flex items-center gap-1.5 disabled:opacity-60">
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
          {enviando ? "Enviando…" : url ? "Trocar" : "Enviar imagem"}
        </button>
        {url && (
          <button type="button" onClick={onRemover} className="inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[rgba(239,68,68,0.12)]" style={{ color: "#EF4444" }} aria-label={`Remover ${titulo}`}>
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (inputRef.current) inputRef.current.value = "";
            if (f) onEscolher(f);
          }}
        />
      </div>
    </section>
  );
}
