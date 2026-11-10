"use client";

/**
 * Captura de campo — UI premium, à prova de criança. Dois passos:
 *  1) CAPTURAR: falar (grava) e/ou escrever + foto + GPS automático.
 *  2) CONFERIR: a IA devolve o rascunho limpo (assunto/descrição/área/órgão a
 *     cobrar/local); o assessor ajusta, vê "o que você disse" e REGISTRA.
 * Nada salva sem confirmar (modo assistido). Voz é opcional (sempre dá pra escrever).
 */

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  Loader2,
  MapPin,
  Mic,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";

import {
  transcreverCaptura,
  estruturarOcorrencia,
  criarOcorrenciaCampo,
  type RascunhoOcorrencia,
} from "@/app/actions/politico/captura-campo";
import { uploadAnexoDemanda, ANEXO_MAX_BYTES } from "@/lib/politico/anexos-upload";

const AREAS: { value: string; label: string }[] = [
  { value: "infraestrutura", label: "Infraestrutura" },
  { value: "servico_publico", label: "Serviço público" },
  { value: "saude", label: "Saúde" },
  { value: "educacao", label: "Educação" },
  { value: "seguranca", label: "Segurança" },
  { value: "assistencia_social", label: "Assistência social" },
  { value: "meio_ambiente", label: "Meio ambiente" },
  { value: "documentacao", label: "Documentação" },
  { value: "outro", label: "Outro" },
];
const PRIORIDADES = [
  { value: "baixa", label: "Baixa" },
  { value: "normal", label: "Normal" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" },
];

function blobParaBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => {
      const s = String(r.result);
      resolve(s.slice(s.indexOf(",") + 1));
    };
    r.onerror = () => reject(new Error("leitura falhou"));
    r.readAsDataURL(blob);
  });
}

function mmss(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function CapturaCampoClient({
  orgaosChips,
  vozDisponivel = false,
}: {
  orgaosChips: string[];
  /** A transcrição está disponível nesta org? Se não, o microfone nem aparece. */
  vozDisponivel?: boolean;
}) {
  const [etapa, setEtapa] = useState<"capturar" | "revisar" | "pronto">("capturar");
  const [erro, setErro] = useState<string | null>(null);

  // --- Captura ---
  const [texto, setTexto] = useState("");
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [temMic, setTemMic] = useState(true);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [foto, setFoto] = useState<File | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);

  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<"buscando" | "ok" | "off">("buscando");

  const [processando, setProcessando] = useState(false);

  // --- Revisão ---
  const [rascunho, setRascunho] = useState<RascunhoOcorrencia | null>(null);
  const [assunto, setAssunto] = useState("");
  const [descricao, setDescricao] = useState("");
  const [area, setArea] = useState("outro");
  const [orgao, setOrgao] = useState("");
  const [prioridade, setPrioridade] = useState("normal");
  const [rua, setRua] = useState("");
  const [numero, setNumero] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [mostrarCru, setMostrarCru] = useState(false);
  const [temCidadao, setTemCidadao] = useState(false);
  const [contatoNome, setContatoNome] = useState("");
  const [contatoFone, setContatoFone] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [demandaId, setDemandaId] = useState<string | null>(null);

  // Pede a localização. Chamada ao abrir (automática) e no botão "Usar minha
  // localização" — no clique o navegador reabre o pedido de permissão (mais
  // confiável que só no load, sobretudo no desktop).
  const pedirLocalizacao = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoStatus("off");
      return;
    }
    setGeoStatus("buscando");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGeo({ lat: p.coords.latitude, lng: p.coords.longitude });
        setGeoStatus("ok");
      },
      () => setGeoStatus("off"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, []);

  // GPS automático ao abrir — silencioso, opcional.
  useEffect(() => {
    pedirLocalizacao();
  }, [pedirLocalizacao]);

  // Detecta suporte a gravação.
  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      typeof window.MediaRecorder !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia;
    setTemMic(ok);
  }, []);

  const pararTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  async function iniciarGravacao() {
    setErro(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        setAudioBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      recRef.current = rec;
      rec.start();
      setGravando(true);
      setSegundos(0);
      timerRef.current = setInterval(() => {
        setSegundos((s) => {
          if (s >= 119) {
            // teto de 2 min — para sozinho (áudio curto transcreve melhor e barato)
            pararGravacao();
            return s;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      setTemMic(false);
      setErro("Não consegui acessar o microfone. Você pode escrever o relato.");
    }
  }

  function pararGravacao() {
    try {
      recRef.current?.stop();
    } catch {
      /* já parado */
    }
    setGravando(false);
    pararTimer();
  }

  function apagarAudio() {
    setAudioBlob(null);
    setSegundos(0);
  }

  function escolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (fotoRef.current) fotoRef.current.value = "";
    if (!f) return;
    if (f.size > ANEXO_MAX_BYTES) {
      setErro("A foto passou de 50MB. Tire outra menor.");
      return;
    }
    setFoto(f);
    setFotoUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
  }

  function removerFoto() {
    setFoto(null);
    setFotoUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
  }

  // Microfone só quando o navegador suporta E a transcrição está disponível na org.
  const podeVoz = vozDisponivel && temMic;
  const temConteudo = !!audioBlob || texto.trim().length > 0;

  async function continuar() {
    setErro(null);
    if (!temConteudo) {
      setErro("Grave ou escreva o que você viu.");
      return;
    }
    setProcessando(true);
    try {
      let cru = texto.trim();
      if (audioBlob) {
        const b64 = await blobParaBase64(audioBlob);
        const r = await transcreverCaptura(b64, audioBlob.type || "audio/webm");
        if (r.ok) {
          cru = [r.texto, texto.trim()].filter(Boolean).join(". ").trim();
        } else if (!cru) {
          setErro(r.erro);
          setProcessando(false);
          return;
        }
      }
      if (!cru) {
        setErro("Grave ou escreva o que você viu.");
        setProcessando(false);
        return;
      }
      const est = await estruturarOcorrencia({
        textoCru: cru,
        latitude: geo?.lat ?? null,
        longitude: geo?.lng ?? null,
      });
      if (!est.ok) {
        setErro(est.erro);
        setProcessando(false);
        return;
      }
      const r = est.rascunho;
      setRascunho(r);
      setAssunto(r.assunto);
      setDescricao(r.descricao);
      setArea(r.area || "outro");
      setOrgao(r.orgaoSugerido);
      setBairro(r.bairro);
      setRua(r.rua);
      setCidade(r.cidade);
      setEtapa("revisar");
    } catch {
      setErro("Algo falhou ao processar. Tente de novo.");
    } finally {
      setProcessando(false);
    }
  }

  async function registrar() {
    setErro(null);
    if (!assunto.trim()) {
      setErro("A descrição ficou vazia. Escreva o que o gabinete precisa saber.");
      return;
    }
    setSalvando(true);
    try {
      const res = await criarOcorrenciaCampo({
        assunto: assunto.trim(),
        area,
        orgao: orgao.trim(),
        prioridade,
        bairro: bairro.trim(),
        rua: rua.trim(),
        numero: numero.trim(),
        cidade: cidade.trim(),
        contatoNome: temCidadao ? contatoNome.trim() || null : null,
        contatoFone: temCidadao ? contatoFone.trim() || null : null,
      });
      if (!res.ok) {
        setErro(res.erro);
        setSalvando(false);
        return;
      }
      // Foto sobe agora (precisa do id). Falha de foto não desfaz a demanda.
      if (foto) {
        await uploadAnexoDemanda(res.demandaId, foto);
      }
      setDemandaId(res.demandaId);
      setEtapa("pronto");
    } catch {
      setErro("Não consegui registrar agora. Tente de novo.");
      setSalvando(false);
    }
  }

  function recomecar() {
    setEtapa("capturar");
    setErro(null);
    setTexto("");
    apagarAudio();
    removerFoto();
    setRascunho(null);
    setAssunto("");
    setDescricao("");
    setArea("outro");
    setOrgao("");
    setPrioridade("normal");
    setRua("");
    setNumero("");
    setBairro("");
    setCidade("");
    setTemCidadao(false);
    setContatoNome("");
    setContatoFone("");
    setDemandaId(null);
    setSalvando(false);
  }

  // Chips de órgão: os do mandato + o sugerido pela IA (sem duplicar).
  const chips = Array.from(new Set([rascunho?.orgaoSugerido, ...orgaosChips].filter((x): x is string => !!x)));

  return (
    <div className="gip-ambient-bg mx-auto max-w-[620px] px-4 py-6 space-y-5">
      {/* Hero */}
      <header
        className="wr-card relative overflow-hidden p-5 sm:p-6"
        style={{
          background: "var(--hero-grad)",
          border: "1px solid color-mix(in srgb, var(--color-accent) 22%, transparent)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full"
          style={{ background: "radial-gradient(closest-side,color-mix(in srgb, var(--color-accent) 18%, transparent),transparent)" }}
        />
        <div className="relative">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--hero-eyebrow)" }}>
            Gabinete de Rua
          </span>
          <h1 className="font-heading mt-1 text-2xl font-bold leading-tight sm:text-3xl" style={{ color: "#FFFFFF" }}>
            Registrar na rua
          </h1>
          <p className="mt-1.5 text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>
            {etapa === "capturar" && "Viu um problema? Fale ou escreva. A IA organiza e diz quem cobrar."}
            {etapa === "revisar" && "Confira o que a IA entendeu e ajuste. Nada é registrado sem você confirmar."}
            {etapa === "pronto" && "Pronto! Sua atitude virou demanda do gabinete."}
          </p>
          {/* Passos */}
          {etapa !== "pronto" && (
            <div className="mt-4 flex items-center gap-2 text-xs font-semibold" style={{ color: "rgba(255,255,255,0.8)" }}>
              <span className={etapa === "capturar" ? "" : "opacity-55"}>① Capturar</span>
              <span style={{ color: "rgba(255,255,255,0.3)" }}>→</span>
              <span className={etapa === "revisar" ? "" : "opacity-55"}>② Conferir</span>
            </div>
          )}
        </div>
      </header>

      {erro && (
        <div role="alert" className="rounded-xl px-4 py-3 text-sm font-medium" style={{ background: "#FBE4E2", color: "#A3302A" }}>
          {erro}
        </div>
      )}

      {/* ---------- ETAPA 1: CAPTURAR ---------- */}
      {etapa === "capturar" && (
        <>
          {/* Voz */}
          {podeVoz && (
            <section className="gip-glass p-6 text-center">
              <button
                type="button"
                onClick={gravando ? pararGravacao : iniciarGravacao}
                disabled={processando}
                className="relative mx-auto flex h-24 w-24 items-center justify-center rounded-full transition-transform active:scale-95"
                style={{
                  background: gravando ? "#DC2626" : "var(--color-accent)",
                  color: gravando ? "#fff" : "#14181F",
                  boxShadow: gravando ? "0 0 0 8px rgba(220,38,38,0.18)" : "0 10px 30px color-mix(in srgb, var(--color-accent) 35%, transparent)",
                }}
                aria-label={gravando ? "Parar gravação" : "Gravar voz"}
              >
                {gravando ? <Square className="h-9 w-9" fill="currentColor" aria-hidden /> : <Mic className="h-10 w-10" aria-hidden />}
                {gravando && (
                  <span
                    aria-hidden
                    className="absolute inset-0 animate-ping rounded-full"
                    style={{ background: "rgba(220,38,38,0.35)" }}
                  />
                )}
              </button>
              <p className="mt-4 text-base font-bold" style={{ color: "var(--color-text)" }}>
                {gravando ? `Gravando… ${mmss(segundos)}` : audioBlob ? "Áudio gravado" : "Toque e fale"}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--color-text-subtle)" }}>
                {gravando ? "Toque de novo para parar." : "Diga o que você viu, como quiser. A IA corrige e organiza."}
              </p>
              {audioBlob && !gravando && (
                <div className="mt-3 flex items-center justify-center gap-2">
                  <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "color-mix(in srgb, var(--color-accent) 14%, transparent)", color: "var(--accent-ink, var(--color-accent))" }}>
                    🎙️ {mmss(segundos)} gravado
                  </span>
                  <button type="button" onClick={apagarAudio} className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> apagar
                  </button>
                </div>
              )}
            </section>
          )}

          {/* Texto */}
          <section className="gip-glass p-5 space-y-2">
            <label className="block text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              {podeVoz ? "Ou escreva o que você viu" : "Escreva o que você viu"}
            </label>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={3}
              placeholder="Ex.: tem um fio pendurado na esquina da rua tal, baixo, risco de acidente"
              className="wr-input w-full"
            />
            <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
              Pode escrever simples — a IA deixa certo e exato.
            </p>
          </section>

          {/* Foto + GPS */}
          <section className="gip-glass p-5 space-y-4">
            <div>
              <p className="mb-2 text-sm font-semibold" style={{ color: "var(--color-text)" }}>Foto (recomendado)</p>
              {fotoUrl ? (
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fotoUrl} alt="Foto da ocorrência" className="h-40 w-auto rounded-xl object-cover" />
                  <button
                    type="button"
                    onClick={removerFoto}
                    className="absolute -right-2 -top-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-white"
                    style={{ background: "#DC2626" }}
                    aria-label="Remover foto"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fotoRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed py-6 text-sm font-semibold transition-colors"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
                >
                  <Camera className="h-5 w-5" aria-hidden /> Tirar foto do problema
                </button>
              )}
              <input ref={fotoRef} type="file" accept="image/*" capture="environment" onChange={escolherFoto} className="hidden" />
            </div>

            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm"
              style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}
            >
              <MapPin className="h-4 w-4 shrink-0" style={{ color: geoStatus === "ok" ? "#16A34A" : "var(--color-text-subtle)" }} aria-hidden />
              {geoStatus === "buscando" && (
                <span style={{ color: "var(--color-text-muted)" }}>Pegando sua localização…</span>
              )}
              {geoStatus === "ok" && (
                <span style={{ color: "var(--color-text-muted)" }}>Localização capturada — vira rua e cidade sozinho.</span>
              )}
              {geoStatus === "off" && (
                <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
                  <span style={{ color: "var(--color-text-muted)" }}>Sem localização — no celular ela liga sozinha.</span>
                  <button
                    type="button"
                    onClick={pedirLocalizacao}
                    className="shrink-0 rounded-full px-3 py-1 text-xs font-bold"
                    style={{ background: "color-mix(in srgb, var(--color-accent) 16%, transparent)", color: "var(--accent-ink, var(--color-accent))" }}
                  >
                    Usar minha localização
                  </button>
                </div>
              )}
            </div>
          </section>

          <button
            type="button"
            onClick={continuar}
            disabled={!temConteudo || processando || gravando}
            className="wr-btn-dark inline-flex w-full items-center justify-center gap-2 py-3.5 text-base disabled:opacity-50"
          >
            {processando ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Organizando com a IA…
              </>
            ) : (
              <>
                Continuar <ArrowRight className="h-5 w-5" aria-hidden />
              </>
            )}
          </button>
          <p className="text-center text-xs" style={{ color: "var(--color-text-subtle)" }}>
            A IA só organiza o que você disse. Você confere tudo antes de registrar.
          </p>
        </>
      )}

      {/* ---------- ETAPA 2: REVISAR ---------- */}
      {etapa === "revisar" && rascunho && (
        <>
          {rascunho.semIA && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FCF1DC", color: "#8A5A10" }}>
              A IA não está ligada nesta conta — organizei o básico, confira e ajuste o texto.
            </div>
          )}

          {/* O rascunho */}
          <section className="gip-glass p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" style={{ color: "var(--accent-ink, var(--color-accent))" }} aria-hidden />
              <span className="text-sm font-bold" style={{ color: "var(--color-text)" }}>O que a IA entendeu</span>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Assunto</label>
              <input type="text" value={assunto} onChange={(e) => setAssunto(e.target.value)} className="wr-input w-full" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Descrição</label>
              <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} className="wr-input w-full" />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Área</label>
                <select value={area} onChange={(e) => setArea(e.target.value)} className="wr-input w-full">
                  {AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Prioridade</label>
                <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)} className="wr-input w-full">
                  {PRIORIDADES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>

            {/* Órgão — o diferencial: quem cobrar */}
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                Quem cobrar (órgão)
              </label>
              <input type="text" value={orgao} onChange={(e) => setOrgao(e.target.value)} placeholder="Ex.: Cemig, Copasa, Secretaria de Obras…" className="wr-input w-full" />
              {chips.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {chips.map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setOrgao(o)}
                      className="rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
                      style={orgao === o
                        ? { background: "var(--color-accent)", color: "#16181D" }
                        : { border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              )}
              {rascunho.orgaoSugerido && (
                <p className="mt-1.5 text-xs" style={{ color: "var(--color-text-subtle)" }}>
                  💡 A IA sugeriu <strong style={{ color: "var(--color-text-muted)" }}>{rascunho.orgaoSugerido}</strong> — confira se é esse mesmo.
                </p>
              )}
            </div>
          </section>

          {/* Onde fica */}
          <section className="gip-glass p-5 space-y-3">
            <p className="text-sm font-bold" style={{ color: "var(--color-text)" }}>Onde fica</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
              <div className="sm:col-span-4">
                <label className="mb-1 block text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Rua / Avenida</label>
                <input type="text" value={rua} onChange={(e) => setRua(e.target.value)} className="wr-input w-full" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Número</label>
                <input type="text" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="s/n" className="wr-input w-full" />
              </div>
              <div className="sm:col-span-3">
                <label className="mb-1 block text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Bairro</label>
                <input type="text" value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="a confirmar" className="wr-input w-full" />
              </div>
              <div className="sm:col-span-3">
                <label className="mb-1 block text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Cidade</label>
                <input type="text" value={cidade} onChange={(e) => setCidade(e.target.value)} className="wr-input w-full" />
              </div>
            </div>
          </section>

          {/* Cidadão opcional */}
          <section className="gip-glass p-5 space-y-3">
            {!temCidadao ? (
              <button
                type="button"
                onClick={() => setTemCidadao(true)}
                className="text-sm font-semibold"
                style={{ color: "var(--accent-ink, var(--color-accent))" }}
              >
                + Alguém pediu isso? (opcional)
              </button>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold" style={{ color: "var(--color-text)" }}>Quem pediu (opcional)</p>
                  <button type="button" onClick={() => setTemCidadao(false)} className="text-xs" style={{ color: "var(--color-text-muted)" }}>remover</button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input type="text" value={contatoNome} onChange={(e) => setContatoNome(e.target.value)} placeholder="Nome do cidadão" className="wr-input w-full" />
                  <input type="tel" value={contatoFone} onChange={(e) => setContatoFone(e.target.value)} placeholder="WhatsApp (opcional)" className="wr-input w-full" />
                </div>
                <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Se tiver o nome, a pessoa entra na base. Senão, fica como ocorrência de rua.</p>
              </>
            )}
          </section>

          {/* O que você disse (cru) */}
          <section className="gip-glass p-4">
            <button
              type="button"
              onClick={() => setMostrarCru((v) => !v)}
              className="flex w-full items-center justify-between text-sm font-semibold"
              style={{ color: "var(--color-text-muted)" }}
            >
              O que você disse (original)
              <ChevronDown className={`h-4 w-4 transition-transform ${mostrarCru ? "rotate-180" : ""}`} aria-hidden />
            </button>
            {mostrarCru && (
              <p className="mt-2 whitespace-pre-wrap text-sm" style={{ color: "var(--color-text-subtle)" }}>
                {rascunho.cru}
              </p>
            )}
          </section>

          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setEtapa("capturar")} disabled={salvando} className="wr-btn inline-flex items-center gap-1.5">
              <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar
            </button>
            <button type="button" onClick={registrar} disabled={salvando} className="wr-btn-dark inline-flex flex-1 items-center justify-center gap-2 py-3 text-base disabled:opacity-50">
              {salvando ? <><Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Registrando…</> : <><Check className="h-5 w-5" aria-hidden /> Registrar ocorrência</>}
            </button>
          </div>
        </>
      )}

      {/* ---------- ETAPA 3: PRONTO ---------- */}
      {etapa === "pronto" && (
        <section className="gip-glass p-7 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, #16A34A 18%, transparent)" }}>
            <Check className="h-9 w-9" style={{ color: "#16A34A" }} aria-hidden />
          </div>
          <h2 className="font-heading mt-4 text-xl font-bold" style={{ color: "var(--color-text)" }}>Registrado!</h2>
          <p className="mt-1.5 text-sm" style={{ color: "var(--color-text-muted)" }}>
            Já está no gabinete{orgao.trim() ? <> — pronto pra cobrar <strong>{orgao.trim()}</strong></> : null}. E entrou no seu placar da semana.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {demandaId && (
              <Link href={`/app/politico/demandas/${demandaId}`} className="wr-btn-dark inline-flex items-center justify-center gap-1.5">
                Ver a demanda <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
            <button type="button" onClick={recomecar} className="wr-btn inline-flex items-center justify-center gap-1.5">
              <RotateCcw className="h-4 w-4" aria-hidden /> Registrar outra
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
