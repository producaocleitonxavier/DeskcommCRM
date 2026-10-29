"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Mic, ShieldCheck, Upload, Play, Loader2, Check, Gauge, Square, Trash2, RotateCcw, FileText, Copy } from "lucide-react";
import { CommandHero } from "@/components/politico/command-hero";
import { clonarVozDoMandato, alternarVozAtiva, gerarPreviaVoz, definirVozSpeed } from "@/app/actions/politico/voz";
import { VOZ_SPEED_PRESETS } from "@/lib/voz/velocidade";

const MIMES_GRAVACAO = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus"];
function escolherMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIMES_GRAVACAO.find((m) => MediaRecorder.isTypeSupported(m));
}
function extDoTipo(tipo: string): string {
  if (tipo.includes("ogg")) return "ogg";
  if (tipo.includes("webm")) return "webm";
  if (tipo.includes("mp4") || tipo.includes("m4a")) return "m4a";
  return "webm";
}
function fmtTempo(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

interface Inicial {
  temVoz: boolean;
  ativo: boolean;
  consentimentoPor: string | null;
  consentimentoEm: string | null;
  providerConfigurado: boolean;
  velocidade: number;
}

const TEXTO_PREVIA_PADRAO =
  "Olá! Passando pra te desejar um feliz aniversário e te agradecer por caminhar junto comigo. Um grande abraço!";

/**
 * Roteiro que o político LÊ enquanto grava a amostra. Pensado pra clonagem de
 * qualidade: tem saudação, pergunta, exclamação, uma pequena história (muda o
 * tom), números e um fecho caloroso — essa VARIAÇÃO de entonação é o que faz o
 * clone soar natural. É genérico e NEUTRO de propósito (sem nome, cidade,
 * partido ou promessa): serve pra qualquer cliente e respeita a lei eleitoral.
 */
const ROTEIRO_PARA_LER = `Oi! Tudo bem com você? Aqui quem fala sou eu, e eu quero começar te agradecendo de coração por esse tempo que você está me dando agora.

Sabe, todo dia eu aprendo uma coisa nova nesse trabalho. A parte de que eu mais gosto, de longe, é quando eu saio e vou pra rua conversar com as pessoas de verdade. É ali — no portão de uma casa, na feira, na saída da escola — que a gente entende o que realmente importa.

Outro dia mesmo, uma senhora me parou e falou assim: "Olha, eu não quero muita coisa, não. Eu só quero ser ouvida." E ela tem toda a razão! Às vezes a gente complica o que é simples. Ouvir já é metade do caminho.

Eu acredito numa ideia bem direta: trabalho bom é o que resolve. Não é discurso bonito, não é promessa grande. É o problema do dia a dia que alguém finalmente escuta e vai lá resolver. É a família que bate na porta precisando de ajuda e encontra a porta aberta.

Deixa eu te contar os números que me movem: são milhares de pessoas, de dezenas de bairros, cada uma com uma história, um sonho, uma dificuldade. Como é que você escuta tanta gente? Com paciência, com respeito, e com uma equipe que veste a camisa.

E o que eu aprendi ao longo dessa jornada é nunca dar as costas pra quem confiou em você. Confiança é a coisa mais difícil de ganhar e a mais fácil de perder.

Então, se eu puder te deixar um recado hoje, é esse: pode contar comigo. De manhã, de tarde, de noite. Nos dias bons e, principalmente, nos dias difíceis.

Muito obrigado, viu? De verdade. Um abraço bem grande, e até a próxima!`;

const DICAS_GRAVACAO = [
  "Fique num lugar silencioso — sem TV, música, ventilador barulhento ou rua.",
  "Segure o celular a um palmo da boca (nem colado, nem longe demais).",
  "Fale natural, do seu jeito — como se conversasse com um amigo.",
  "Varie o tom: sorria numas partes, fale sério em outras. Isso deixa o clone mais real.",
  "Leia com calma, sem pressa. De 2 a 3 minutos é o ideal.",
  "Errou uma palavra? Siga em frente — ou é só regravar no fim.",
];

export default function VozClient({ inicial }: { inicial: Inicial }) {
  const [temVoz, setTemVoz] = useState(inicial.temVoz);
  const [ativo, setAtivo] = useState(inicial.ativo);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pending, start] = useTransition();
  const [textoPrevia, setTextoPrevia] = useState(TEXTO_PREVIA_PADRAO);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [velocidade, setVelocidade] = useState(inicial.velocidade);
  const [copiado, setCopiado] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function copiarRoteiro() {
    navigator.clipboard?.writeText(ROTEIRO_PARA_LER).then(
      () => {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      },
      () => {},
    );
  }

  // --- Gravação ao vivo (mic do próprio aparelho) ---
  const [gravando, setGravando] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [gravacao, setGravacao] = useState<Blob | null>(null);
  const [gravacaoUrl, setGravacaoUrl] = useState<string | null>(null);
  const [gravacaoSeg, setGravacaoSeg] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const descartarRef = useRef(false);
  const elapsedRef = useRef(0);

  useEffect(() => {
    if (!gravando) return;
    const id = setInterval(() => {
      setElapsed((s) => {
        elapsedRef.current = s + 1;
        return s + 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [gravando]);

  // Fecha o mic se sair da tela no meio da gravação.
  useEffect(
    () => () => {
      descartarRef.current = true;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    },
    [],
  );

  function limparGravacao() {
    if (gravacaoUrl) URL.revokeObjectURL(gravacaoUrl);
    setGravacao(null);
    setGravacaoUrl(null);
    setGravacaoSeg(0);
  }

  async function iniciarGravacao() {
    if (gravando) return;
    setMsg(null);
    limparGravacao();
    setNomeArquivo(null); // gravar substitui o arquivo escolhido
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = escolherMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      descartarRef.current = false;
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setGravando(false);
        const segundos = elapsedRef.current;
        setElapsed(0);
        if (descartarRef.current || chunksRef.current.length === 0) return;
        const tipo = rec.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: tipo });
        setGravacao(blob);
        setGravacaoUrl(URL.createObjectURL(blob));
        setGravacaoSeg(segundos);
      };
      recorderRef.current = rec;
      elapsedRef.current = 0;
      setElapsed(0);
      rec.start();
      setGravando(true);
    } catch {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setMsg({
        tipo: "erro",
        texto: "Não consegui acessar o microfone. Toque em permitir quando o navegador pedir, ou verifique a permissão.",
      });
    }
  }

  function pararGravacao() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }
  function cancelarGravacao() {
    descartarRef.current = true;
    pararGravacao();
    setElapsed(0);
  }

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    // Gravação ao vivo tem prioridade sobre o arquivo (se houver as duas).
    if (gravacao) {
      fd.set("amostra", gravacao, `gravacao.${extDoTipo(gravacao.type || "audio/webm")}`);
    }
    const amostra = fd.get("amostra");
    if (!(amostra instanceof File) || amostra.size === 0) {
      setMsg({ tipo: "erro", texto: "Grave a voz agora ou suba um arquivo de áudio antes de clonar." });
      return;
    }
    start(async () => {
      const r = await clonarVozDoMandato(fd);
      if (r.ok) {
        setTemVoz(true);
        setMsg({ tipo: "ok", texto: "Voz clonada! Ouça a prévia abaixo antes de ligar." });
        formRef.current?.reset();
        setNomeArquivo(null);
        limparGravacao();
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
          Peça pro político falar de <strong>2 a 3 minutos</strong>, em lugar quieto, com voz natural. Você pode <strong>gravar agora mesmo pelo celular</strong> — ou subir um áudio pronto.
        </p>

        {/* GUIA DE GRAVAÇÃO — dicas + roteiro pronto pra ler (ninguém sabe o que falar) */}
        <div className="rounded-[16px] p-4" style={{ border: "1px solid rgba(215,243,106,0.3)", background: "rgba(215,243,106,0.06)" }}>
          <p className="flex items-center gap-1.5 text-sm font-bold" style={{ color: "#D7F36A" }}>
            <FileText className="h-4 w-4" aria-hidden /> Não sabe o que falar? É só ler este texto
          </p>

          <ul className="mt-3 space-y-1.5 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            {DICAS_GRAVACAO.map((d) => (
              <li key={d} className="flex gap-2">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "#D7F36A" }} aria-hidden />
                <span>{d}</span>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>Roteiro para ler</span>
            <button
              type="button"
              onClick={copiarRoteiro}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
              style={{ border: "1px solid var(--color-border)", background: "var(--color-surface-elevated)", color: copiado ? "#D7F36A" : "var(--color-text-muted)" }}
            >
              {copiado ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {copiado ? "Copiado!" : "Copiar texto"}
            </button>
          </div>
          <div
            className="mt-2 max-h-72 overflow-y-auto whitespace-pre-line rounded-[12px] p-3.5 text-[15px] leading-relaxed"
            style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
          >
            {ROTEIRO_PARA_LER}
          </div>
          <p className="mt-2 text-[12px]" style={{ color: "var(--color-text-subtle)" }}>
            Dá pra ler direto da tela enquanto grava. Fale com o seu jeito — o texto é só um guia pra soltar a voz.
          </p>
        </div>

        {/* OPÇÃO 1 — Gravar ao vivo pelo microfone do aparelho */}
        <div className="rounded-[16px] p-4" style={{ border: "1px solid var(--color-border)", background: "var(--color-surface-elevated)" }}>
          <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>
            <Mic className="h-3.5 w-3.5" aria-hidden /> Gravar agora (pelo aparelho)
          </p>

          {!gravando && !gravacao && (
            <button
              type="button"
              onClick={iniciarGravacao}
              className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-[14px] px-4 py-7 text-center transition-transform hover:scale-[1.01]"
              style={{ border: "2px dashed rgba(215,243,106,0.5)", background: "rgba(215,243,106,0.07)" }}
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(215,243,106,0.16)", color: "#D7F36A" }} aria-hidden>
                <Mic className="h-7 w-7" />
              </span>
              <span className="text-[16px] font-bold" style={{ color: "#D7F36A" }}>Toque para gravar a voz</span>
              <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Permita o microfone quando pedir · fale 2 a 3 min</span>
            </button>
          )}

          {gravando && (
            <div className="flex flex-col items-center gap-3 rounded-[14px] px-4 py-6" style={{ border: "2px solid rgba(239,68,68,0.5)", background: "rgba(239,68,68,0.08)" }}>
              <span className="flex items-center gap-2 text-2xl font-bold tabular-nums" style={{ color: "#F87171" }}>
                <span className="h-3 w-3 animate-pulse rounded-full" style={{ background: "#F87171" }} aria-hidden />
                {fmtTempo(elapsed)}
              </span>
              <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Gravando… fale com voz natural. Pare quando passar de ~2 minutos.</span>
              <div className="flex gap-2">
                <button type="button" onClick={cancelarGravacao} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold" style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text-muted)" }}>
                  <Trash2 className="h-4 w-4" aria-hidden /> Cancelar
                </button>
                <button type="button" onClick={pararGravacao} className="inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-bold" style={{ background: "#D7F36A", color: "#1B2206" }}>
                  <Square className="h-4 w-4" aria-hidden /> Parar
                </button>
              </div>
            </div>
          )}

          {!gravando && gravacao && (
            <div className="flex flex-col gap-3 rounded-[14px] px-4 py-4" style={{ border: "2px solid #D7F36A", background: "rgba(215,243,106,0.08)" }}>
              <span className="flex items-center gap-2 text-[15px] font-bold" style={{ color: "#D7F36A" }}>
                <Check className="h-5 w-5" aria-hidden /> Gravação pronta {gravacaoSeg > 0 ? `(${fmtTempo(gravacaoSeg)})` : ""}
              </span>
              {gravacaoUrl && <audio controls src={gravacaoUrl} className="w-full" />}
              <div className="flex gap-2">
                <button type="button" onClick={iniciarGravacao} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold" style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text-muted)" }}>
                  <RotateCcw className="h-4 w-4" aria-hidden /> Regravar
                </button>
                <button type="button" onClick={() => limparGravacao()} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold" style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text-muted)" }}>
                  <Trash2 className="h-4 w-4" aria-hidden /> Descartar
                </button>
              </div>
              <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Ouça pra conferir. Se ficou boa, confirme o consentimento e clone embaixo.</span>
            </div>
          )}
        </div>

        {/* OPÇÃO 2 — Subir arquivo pronto (só aparece se não gravou) */}
        {!gravacao && (
          <div>
            <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>ou suba um arquivo pronto</p>
            <label
              htmlFor="amostra-voz"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[16px] px-4 py-6 text-center transition-transform hover:scale-[1.01]"
              style={{ border: `2px dashed ${nomeArquivo ? "#D7F36A" : "var(--color-border)"}`, background: "var(--color-surface-elevated)" }}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: "rgba(215,243,106,0.12)", color: "#D7F36A" }} aria-hidden>
                {nomeArquivo ? <Check className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
              </span>
              <span className="text-[15px] font-bold" style={{ color: nomeArquivo ? "#D7F36A" : "var(--color-text)" }}>
                {nomeArquivo ?? "Clique para subir o áudio"}
              </span>
              <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
                {nomeArquivo ? "Arquivo pronto — agora é só clonar embaixo" : ".ogg, .mp3 ou .wav · 2 a 3 min"}
              </span>
              <input
                id="amostra-voz"
                name="amostra"
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => setNomeArquivo(e.target.files?.[0]?.name ?? null)}
              />
            </label>
          </div>
        )}
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
