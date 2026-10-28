"use client";

import { useRef, useState, useTransition } from "react";
import { Mic, ShieldCheck, Upload, Play, Loader2, Check, Gauge } from "lucide-react";
import { CommandHero } from "@/components/politico/command-hero";
import { clonarVozDoMandato, alternarVozAtiva, gerarPreviaVoz, definirVozSpeed } from "@/app/actions/politico/voz";
import { VOZ_SPEED_PRESETS } from "@/lib/voz/velocidade";

interface Inicial {
  temVoz: boolean;
  ativo: boolean;
  consentimentoPor: string | null;
  consentimentoEm: string | null;
  providerConfigurado: boolean;
  velocidade: number;
}

const TEXTO_PREVIA_PADRAO =
  "Olá! Aqui é o Cleiton Xavier. Passando pra te desejar um feliz aniversário e te agradecer por caminhar junto comigo. Um grande abraço!";

export default function VozClient({ inicial }: { inicial: Inicial }) {
  const [temVoz, setTemVoz] = useState(inicial.temVoz);
  const [ativo, setAtivo] = useState(inicial.ativo);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pending, start] = useTransition();
  const [textoPrevia, setTextoPrevia] = useState(TEXTO_PREVIA_PADRAO);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [velocidade, setVelocidade] = useState(inicial.velocidade);
  const formRef = useRef<HTMLFormElement>(null);

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await clonarVozDoMandato(fd);
      if (r.ok) {
        setTemVoz(true);
        setMsg({ tipo: "ok", texto: "Voz clonada! Ouça a prévia abaixo antes de ligar." });
        formRef.current?.reset();
        setNomeArquivo(null);
      } else {
        setMsg({ tipo: "erro", texto: r.erro ?? "Falha." });
      }
    });
  }

  function ouvir() {
    setMsg(null);
    setAudioUrl(null);
    start(async () => {
      const r = await gerarPreviaVoz(textoPrevia, velocidade);
      if (r.ok && r.audioDataUrl) setAudioUrl(r.audioDataUrl);
      else setMsg({ tipo: "erro", texto: r.erro ?? "Falha ao gerar a prévia." });
    });
  }

  function escolherVelocidade(v: number) {
    setVelocidade(v);
    setAudioUrl(null);
    setMsg(null);
    start(async () => {
      const r = await definirVozSpeed(v);
      if (!r.ok) setMsg({ tipo: "erro", texto: r.erro ?? "Não consegui salvar a velocidade." });
    });
  }

  function toggle() {
    setMsg(null);
    const novo = !ativo;
    start(async () => {
      const r = await alternarVozAtiva(novo);
      if (r.ok) setAtivo(novo);
      else setMsg({ tipo: "erro", texto: r.erro ?? "Falha." });
    });
  }

  const card = "wr-card p-5 sm:p-6";
  const label = "mb-1.5 block text-xs font-semibold uppercase tracking-wide";

  return (
    <div className="mx-auto max-w-[760px] space-y-[18px] px-4 py-7" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Gabinete · Fase 2"
        titulo="Voz do Mandato"
        subtitulo="Clone a sua própria voz para mandar mensagens pessoais (ex.: feliz aniversário) — com as travas da lei eleitoral."
        acoes={[{ href: "/app/politico", label: "← Voltar" }]}
      />

      {/* Regras TSE */}
      <section className="rounded-[16px] p-4" style={{ background: "rgba(215,243,106,0.08)", border: "1px solid rgba(215,243,106,0.25)" }}>
        <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: "#D7F36A" }}>
          <ShieldCheck className="h-4 w-4" aria-hidden /> Regras obrigatórias (Lei eleitoral — TSE 23.755/2026)
        </p>
        <ul className="mt-2 space-y-1 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
          <li>• Só a <strong>sua própria voz</strong>, com o seu consentimento (nunca a de outra pessoa).</li>
          <li>• Em período eleitoral, a mensagem leva um <strong>aviso de que usa IA</strong>.</li>
          <li>• Respeita o <strong>silêncio de 72h</strong> antes e depois de cada turno.</li>
          <li>• Use em <strong>momentos genuínos</strong> (aniversário), não em disparo massivo.</li>
        </ul>
      </section>

      {!inicial.providerConfigurado && (
        <div className="rounded-[14px] p-4 text-sm" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", color: "#FBBF24" }}>
          ⚙️ Falta conectar a chave do ElevenLabs no servidor (<code>ELEVENLABS_API_KEY</code>). Dá pra começar no plano gratuito pra testar a qualidade.
        </div>
      )}

      {/* Setup: amostra + consentimento */}
      <form ref={formRef} onSubmit={enviar} className={card + " space-y-4"}>
        <h2 className="flex items-center gap-2 font-heading text-[17px] font-bold" style={{ color: "var(--color-text)" }}>
          <Mic className="h-4 w-4" aria-hidden /> 1. A amostra de voz
        </h2>
        <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
          Grave o político lendo um texto por <strong>2 a 3 minutos</strong>, em lugar quieto, com voz natural. Depois é só subir o arquivo aqui (.ogg, .mp3 ou .wav).
        </p>
        <div>
          <label className={label} style={{ color: "var(--color-text-subtle)" }}>Arquivo de áudio</label>
          <label
            htmlFor="amostra-voz"
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[16px] px-4 py-8 text-center transition-transform hover:scale-[1.01]"
            style={{ border: `2px dashed ${nomeArquivo ? "#D7F36A" : "rgba(215,243,106,0.5)"}`, background: "rgba(215,243,106,0.07)" }}
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(215,243,106,0.16)", color: "#D7F36A" }} aria-hidden>
              {nomeArquivo ? <Check className="h-7 w-7" /> : <Upload className="h-7 w-7" />}
            </span>
            <span className="text-[16px] font-bold" style={{ color: "#D7F36A" }}>
              {nomeArquivo ?? "Clique aqui para subir o áudio"}
            </span>
            <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
              {nomeArquivo ? "Arquivo pronto — agora é só clonar embaixo" : "Toque pra escolher · .ogg, .mp3 ou .wav · 2 a 3 min"}
            </span>
            <input
              id="amostra-voz"
              name="amostra"
              type="file"
              accept="audio/*"
              required
              className="hidden"
              onChange={(e) => setNomeArquivo(e.target.files?.[0]?.name ?? null)}
            />
          </label>
        </div>
        <div>
          <label className={label} style={{ color: "var(--color-text-subtle)" }}>Quem autorizou (nome do político)</label>
          <input name="consentido_por" type="text" required placeholder="Ex.: Cleiton Xavier" className="w-full rounded-[12px] px-3.5 py-2.5 text-sm" style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
        </div>
        <label className="flex cursor-pointer items-start gap-2 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
          <input name="consentimento" type="checkbox" required className="mt-0.5" />
          <span>Confirmo que esta é a <strong>minha própria voz</strong> e autorizo a clonagem para mensagens do meu mandato, ciente das regras da lei eleitoral.</span>
        </label>
        <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold disabled:opacity-60" style={{ background: "#D7F36A", color: "#1B2206" }}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
          {temVoz ? "Reenviar amostra / reclonar" : "Clonar minha voz"}
        </button>
      </form>

      {/* Prévia + ativar (só com voz pronta) */}
      {temVoz && (
        <div className={card + " space-y-4"}>
          <h2 className="flex items-center gap-2 font-heading text-[17px] font-bold" style={{ color: "var(--color-text)" }}>
            <Play className="h-4 w-4" aria-hidden /> 2. Ouça e ligue
          </h2>
          {inicial.consentimentoPor && (
            <p className="text-[12px]" style={{ color: "var(--color-text-subtle)" }}>
              ✅ Consentimento de <strong>{inicial.consentimentoPor}</strong>
              {inicial.consentimentoEm ? ` em ${new Date(inicial.consentimentoEm).toLocaleDateString("pt-BR")}` : ""}.
            </p>
          )}
          <div>
            <label className={label} style={{ color: "var(--color-text-subtle)" }}>Texto de teste</label>
            <textarea value={textoPrevia} onChange={(e) => setTextoPrevia(e.target.value)} rows={3} className="w-full rounded-[12px] px-3.5 py-2.5 text-sm" style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
          </div>

          {/* Velocidade da fala — escolha e vale também pros áudios enviados */}
          <div>
            <label className={label + " flex items-center gap-1.5"} style={{ color: "var(--color-text-subtle)" }}>
              <Gauge className="h-3.5 w-3.5" aria-hidden /> Velocidade da voz
            </label>
            <div className="flex flex-wrap gap-2">
              {VOZ_SPEED_PRESETS.map((p) => {
                const ativoSel = Math.abs(velocidade - p.valor) < 0.001;
                return (
                  <button
                    key={p.valor}
                    type="button"
                    onClick={() => escolherVelocidade(p.valor)}
                    disabled={pending}
                    className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors disabled:opacity-60"
                    style={{
                      border: `1px solid ${ativoSel ? "#D7F36A" : "var(--color-border)"}`,
                      background: ativoSel ? "rgba(215,243,106,0.16)" : "var(--color-surface-elevated)",
                      color: ativoSel ? "#D7F36A" : "var(--color-text-muted)",
                    }}
                  >
                    {p.rotulo}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[12px]" style={{ color: "var(--color-text-subtle)" }}>
              Escolha e clique em <strong>Ouvir prévia</strong> pra comparar. A velocidade escolhida vale pros áudios que o gabinete enviar.
            </p>
          </div>

          <button type="button" onClick={ouvir} disabled={pending} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60" style={{ border: "1px solid var(--color-border)", background: "var(--color-surface-elevated)", color: "var(--color-text)" }}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />} Ouvir prévia
          </button>
          {audioUrl && <audio controls src={audioUrl} className="mt-2 w-full" />}

          <div className="flex items-center justify-between gap-3 rounded-[14px] p-3.5" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{ativo ? "Voz do Mandato ligada" : "Voz do Mandato desligada"}</p>
              <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>{ativo ? "Pode gerar e enviar mensagens de voz." : "Pausada — nada é enviado até você ligar."}</p>
            </div>
            <button type="button" onClick={toggle} disabled={pending} className="relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-60" style={{ background: ativo ? "#D7F36A" : "var(--color-border)" }} aria-pressed={ativo}>
              <span className="inline-block h-6 w-6 rounded-full bg-white transition-transform" style={{ transform: ativo ? "translateX(26px)" : "translateX(4px)" }} />
            </button>
          </div>
        </div>
      )}

      {msg && (
        <div className="flex items-center gap-2 rounded-[12px] px-4 py-3 text-sm" style={{ background: msg.tipo === "ok" ? "rgba(215,243,106,0.14)" : "rgba(239,68,68,0.14)", color: msg.tipo === "ok" ? "#D7F36A" : "#F87171" }}>
          {msg.tipo === "ok" && <Check className="h-4 w-4" aria-hidden />} {msg.texto}
        </div>
      )}
    </div>
  );
}
