"use client";

/**
 * Follow-up GUIADO POR OBJETIVO — "à prova de criança" de verdade: a pessoa
 * escolhe O QUE QUER FAZER, o fluxo certo já vem montado por baixo, e ela só
 * edita os textos vendo a jornada ao lado. Sem "nó", "ramo" nem "escada".
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, Send, Loader2, HeartHandshake, Gift, Clock, CalendarCheck, ChevronRight,
} from "lucide-react";

import { CommandHero } from "@/components/politico/command-hero";
import { Button } from "@/components/ui/button";
import { criarFollowupSimples } from "@/app/actions/politico/follow-up-simples-actions";
import { jornadaDaEscada } from "@/lib/followup/escada-jornada";
import type { EscadaSpec } from "@/lib/followup/modelos/escada";

const DIA_MS = 86_400_000;

type Objetivo = "acolher" | "conteudo" | "cobrar" | "lembrar";

interface MetaObjetivo {
  v: Objetivo;
  titulo: string;
  desc: string;
  quando: string;
  Icon: typeof Gift;
  nomePadrao: string;
  rotuloMensagem: string;
  placeholderMensagem: string;
}

const OBJETIVOS: MetaObjetivo[] = [
  {
    v: "acolher", titulo: "Acolher quem chegou", desc: "Dar as boas-vindas a um novo contato.",
    quando: "Começa quando um novo contato entra", Icon: HeartHandshake, nomePadrao: "Boas-vindas",
    rotuloMensagem: "A mensagem de boas-vindas",
    placeholderMensagem: "Oi! Que bom ter você por aqui. Esse é o canal direto com o nosso gabinete — me chama sempre que precisar.",
  },
  {
    v: "conteudo", titulo: "Oferecer um conteúdo", desc: "Pergunto se a pessoa quer; se topar, eu mando.",
    quando: "Começa quando um novo contato entra", Icon: Gift, nomePadrao: "Oferecer conteúdo",
    rotuloMensagem: "A pergunta (oferece o conteúdo)",
    placeholderMensagem: "Quer receber, em primeira mão, os conteúdos que a gente produz? Responde SIM que eu te mando.",
  },
  {
    v: "cobrar", titulo: "Cobrar o retorno de uma demanda", desc: "Dar um retorno sobre um pedido.",
    quando: "Começa quando eu inscrever a pessoa", Icon: Clock, nomePadrao: "Retorno da demanda",
    rotuloMensagem: "A mensagem de retorno",
    placeholderMensagem: "Oi! Passando pra te atualizar sobre o seu pedido — já encaminhamos ao órgão e estamos acompanhando.",
  },
  {
    v: "lembrar", titulo: "Lembrar de um evento", desc: "Avisar sobre um evento ou agenda.",
    quando: "Começa quando eu inscrever a pessoa", Icon: CalendarCheck, nomePadrao: "Lembrete de evento",
    rotuloMensagem: "A mensagem do lembrete",
    placeholderMensagem: "Oi! Passando pra lembrar do nosso encontro. Conto com a sua presença!",
  },
];

export default function FollowupSimplesClient() {
  const router = useRouter();
  const [objetivo, setObjetivo] = useState<Objetivo | null>(null);
  const [nome, setNome] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [material, setMaterial] = useState("");
  const [temLembrete, setTemLembrete] = useState(false);
  const [lembreteDias, setLembreteDias] = useState(3);
  const [lembreteTexto, setLembreteTexto] = useState("");
  const [salvando, start] = useTransition();
  // Convite de evento vai COM algo: o link da arte/flyer ou do site de inscrição.
  const [linkConvite, setLinkConvite] = useState("");

  const meta = OBJETIVOS.find((o) => o.v === objetivo) ?? null;
  // A mensagem que de fato sai: no evento, o link entra numa linha própria no fim.
  const mensagemFinal =
    objetivo === "lembrar" && linkConvite.trim() ? `${mensagem.trim()}\n\n${linkConvite.trim()}` : mensagem.trim();

  function escolher(o: MetaObjetivo) {
    setObjetivo(o.v);
    setNome((n) => n || o.nomePadrao);
    setMensagem("");
    setMaterial("");
    setTemLembrete(false);
    setLembreteTexto("");
    setLinkConvite("");
  }

  // Jornada ao vivo. Para "conteúdo" é um ramo (renderizado à parte); para os
  // demais é a escada.
  const lembrete = temLembrete && lembreteTexto.trim()
    ? { esperaDias: Math.max(1, lembreteDias), texto: lembreteTexto.trim() }
    : null;

  const escadaSpec: EscadaSpec | null =
    objetivo && objetivo !== "conteudo" && mensagem.trim()
      ? {
          prazoDeRespostaMs: 3 * DIA_MS,
          sim: { rotulo: "Respondeu que sim", padrao: "sim" },
          notaDeResposta: "A pessoa respondeu — o atendimento do gabinete assume.",
          toques: [
            { texto: mensagemFinal, rotulo: "Mensagem" },
            ...(lembrete ? [{ esperaAntesMs: lembrete.esperaDias * DIA_MS, texto: lembrete.texto, rotulo: "Lembrete" }] : []),
          ],
        }
      : null;
  const jornadaEscada = escadaSpec ? jornadaDaEscada(escadaSpec) : null;

  function salvar() {
    if (!objetivo) return;
    if (nome.trim().length < 3) return toast.error("Dê um nome ao fluxo (mínimo 3 letras).");
    if (!mensagem.trim()) return toast.error("Escreva a mensagem.");
    if (objetivo === "conteudo" && !material.trim()) return toast.error("Escreva o que você manda quando a pessoa responder sim (o conteúdo/o link).");
    start(async () => {
      const r = await criarFollowupSimples({
        objetivo,
        nome: nome.trim(),
        mensagem: mensagemFinal,
        ...(objetivo === "conteudo" ? { material: material.trim() } : {}),
        ...(lembrete ? { lembrete } : {}),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Fluxo criado como rascunho. Revise e publique quando quiser.");
      router.push("/app/ai/followups");
    });
  }

  // ── Passo 1: escolher o objetivo ──────────────────────────────────────────
  if (!objetivo || !meta) {
    return (
      <div className="gip-ambient-bg mx-auto max-w-[860px] px-4 py-7 space-y-5">
        <CommandHero
          eyebrow="Relacionamento · Follow-up"
          titulo="O que você quer fazer?"
          subtitulo="Escolha o objetivo. O fluxo certo já vem montado — você só escreve as mensagens."
          acoes={[{ href: "/app/ai/followups", label: "← Follow-ups" }]}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {OBJETIVOS.map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => escolher(o)}
              className="gip-glass flex items-start gap-3 p-4 text-left transition-all hover:-translate-y-px"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
                style={{ background: "color-mix(in srgb, var(--color-accent) 16%, transparent)", color: "var(--accent-ink, var(--color-accent))" }}>
                <o.Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold" style={{ color: "var(--color-text)" }}>{o.titulo}</span>
                <span className="mt-0.5 block text-[13px]" style={{ color: "var(--color-text-muted)" }}>{o.desc}</span>
                <span className="mt-1.5 block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>{o.quando}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 self-center" style={{ color: "var(--color-text-subtle)" }} aria-hidden />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Passo 2: escrever as mensagens + ver a jornada ────────────────────────
  return (
    <div className="gip-ambient-bg mx-auto max-w-[1040px] px-4 py-7 space-y-5">
      <CommandHero
        eyebrow="Relacionamento · Follow-up"
        titulo={meta.titulo}
        subtitulo={`${meta.quando}. Nasce como rascunho — ninguém recebe nada até você publicar.`}
        acoes={[{ href: "/app/ai/followups", label: "← Follow-ups" }]}
        extra={
          <button type="button" onClick={() => setObjetivo(null)}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium text-white/85 transition-colors hover:bg-white/10">
            <ArrowLeft size={14} aria-hidden /> Trocar objetivo
          </button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Formulário */}
        <div className="space-y-4">
          <div className="gip-glass space-y-3 p-5">
            <div>
              <label className="mb-1.5 block text-sm font-semibold">Nome do fluxo</label>
              <input className="wr-input w-full" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold">{meta.rotuloMensagem}</label>
              <textarea className="wr-input w-full" rows={3} value={mensagem}
                onChange={(e) => setMensagem(e.target.value)} placeholder={meta.placeholderMensagem} />
            </div>
          </div>

          {objetivo === "lembrar" && (
            <div className="gip-glass space-y-2 p-5">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <CalendarCheck className="h-4 w-4" style={{ color: "var(--accent-ink, var(--color-accent))" }} aria-hidden />
                Link do convite (opcional)
              </label>
              <input
                className="wr-input w-full"
                value={linkConvite}
                onChange={(e) => setLinkConvite(e.target.value)}
                placeholder="https://… (arte/flyer do evento ou site de inscrição)"
              />
              <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
                Vai numa linha própria no fim da mensagem. Cole o link da <strong>arte/flyer</strong> ou do <strong>site de inscrição</strong>. (Mandar a imagem em anexo pela automação é o próximo passo.)
              </p>
            </div>
          )}

          {objetivo === "conteudo" && (
            <div className="gip-glass space-y-2 p-5" style={{ borderColor: "color-mix(in srgb, var(--color-accent) 30%, var(--color-border))" }}>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <Gift className="h-4 w-4" style={{ color: "var(--accent-ink, var(--color-accent))" }} aria-hidden />
                O que eu mando quando a pessoa responder SIM
              </label>
              <textarea className="wr-input w-full" rows={3} value={material}
                onChange={(e) => setMaterial(e.target.value)}
                placeholder="Combinado! Aqui está: https://link-do-seu-conteudo" />
              <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
                Por enquanto, cole o <strong>link</strong> do conteúdo. (Enviar o arquivo em anexo pela automação é o próximo passo.)
              </p>
            </div>
          )}

          <div className="gip-glass p-4">
            <label className="flex items-center gap-2.5 text-sm font-medium">
              <input type="checkbox" checked={temLembrete} onChange={(e) => setTemLembrete(e.target.checked)} />
              Mandar um <strong>lembrete</strong> se a pessoa não responder
            </label>
            {temLembrete && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
                  <Clock className="h-4 w-4" aria-hidden /> Esperar
                  <input type="number" min={1} max={90} value={lembreteDias}
                    onChange={(e) => setLembreteDias(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
                    className="wr-input" style={{ width: 72 }} />
                  dias e mandar:
                </div>
                <textarea className="wr-input w-full" rows={2} value={lembreteTexto}
                  onChange={(e) => setLembreteTexto(e.target.value)}
                  placeholder="Ainda dá tempo! É só me responder por aqui." />
              </div>
            )}
          </div>

          <Button onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Salvar como rascunho
          </Button>
        </div>

        {/* A jornada */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="gip-glass p-5">
            <p className="mb-3 text-sm font-semibold">A jornada</p>

            {objetivo === "conteudo" ? (
              <ol className="space-y-3">
                <MomentoConteudo n={1} quando="Assim que dispara" titulo="Manda a pergunta"
                  texto={mensagem || meta.placeholderMensagem} />
                <li className="rounded-xl p-3" style={{ background: "color-mix(in srgb, var(--color-accent) 10%, transparent)" }}>
                  <p className="text-[12px] font-semibold" style={{ color: "var(--accent-ink, var(--color-accent))" }}>✅ Se responder SIM → manda o material:</p>
                  <p className="mt-1 text-sm" style={{ color: "var(--color-text)" }}>{material || "— escreva o conteúdo/link ao lado —"}</p>
                </li>
                <li className="text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>↩️ Se responder outra coisa → o atendimento assume.</li>
                <li className="text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>
                  ⏭️ Se não responder → {lembrete ? `após ${lembrete.esperaDias} dia(s), manda o lembrete e espera de novo.` : "encerra (ninguém mais é incomodado)."}
                </li>
              </ol>
            ) : jornadaEscada ? (
              <ol className="space-y-3">
                {jornadaEscada.momentos.map((m) => (
                  <li key={m.ordem} className="rounded-xl p-3" style={{ background: "color-mix(in srgb, var(--color-text) 4%, transparent)" }}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>{m.ordem}. {m.quando}</p>
                    <p className="mt-1 text-sm" style={{ color: "var(--color-text)" }}>{m.mensagem}</p>
                    <ul className="mt-2 space-y-0.5 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                      <li>↩️ Se responder: o atendimento assume.</li>
                      <li>⏭️ Se não responder: {m.seNaoResponder}</li>
                    </ul>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Escreva a mensagem para ver a jornada.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MomentoConteudo({ n, quando, titulo, texto }: { n: number; quando: string; titulo: string; texto: string }) {
  return (
    <li className="rounded-xl p-3" style={{ background: "color-mix(in srgb, var(--color-text) 4%, transparent)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>{n}. {quando} · {titulo}</p>
      <p className="mt-1 text-sm" style={{ color: "var(--color-text)" }}>{texto}</p>
    </li>
  );
}
