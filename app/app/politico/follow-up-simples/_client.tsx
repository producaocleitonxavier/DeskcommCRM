"use client";

/**
 * Autoria de follow-up "à prova de criança": a pessoa escreve MENSAGENS e PRAZOS,
 * e VÊ a jornada acontecer ao lado (sem nó, ramo nem jargão). Protótipo p/ estudo
 * no homologação — muitos gabinetes trabalham diferente, e cada um monta o seu.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Send, Loader2, MessageCircle, Clock, Flag } from "lucide-react";

import { CommandHero } from "@/components/politico/command-hero";
import { Button } from "@/components/ui/button";
import { criarFollowupSimples } from "@/app/actions/politico/follow-up-simples-actions";
import { jornadaDaEscada, simularEscada, type Reacao } from "@/lib/followup/escada-jornada";
import type { EscadaSpec } from "@/lib/followup/modelos/escada";

const DIA_MS = 86_400_000;

interface ToqueForm {
  texto: string;
  esperaDias: number;
  rotulo: string;
}

const REACAO_LABEL: Record<Reacao, string> = {
  ignora: "não responde",
  responde_sim: "responde SIM",
  responde_outro: "responde outra coisa",
};

export default function FollowupSimplesClient() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [gatilho, setGatilho] = useState<"lead_created" | "manual">("lead_created");
  const [toques, setToques] = useState<ToqueForm[]>([{ texto: "", esperaDias: 0, rotulo: "" }]);
  const [reacoes, setReacoes] = useState<Reacao[]>(["ignora"]);
  const [salvando, start] = useTransition();

  function setToque(i: number, patch: Partial<ToqueForm>) {
    setToques((a) => a.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  }
  function addToque() {
    if (toques.length >= 5) return;
    setToques((a) => [...a, { texto: "", esperaDias: 3, rotulo: "" }]);
    setReacoes((a) => [...a, "ignora"]);
  }
  function removerToque(i: number) {
    if (toques.length <= 1) return;
    setToques((a) => a.filter((_, j) => j !== i));
    setReacoes((a) => a.filter((_, j) => j !== i));
  }

  // Monta a spec a partir do formulário (só os toques com texto).
  const comTexto = toques.filter((t) => t.texto.trim());
  const spec: EscadaSpec | null =
    comTexto.length > 0
      ? {
          prazoDeRespostaMs: 3 * DIA_MS,
          sim: { rotulo: "Respondeu que sim", padrao: "sim" },
          notaDeResposta: "A pessoa respondeu — quem segue é o atendimento do gabinete.",
          toques: comTexto.map((t, i) => ({
            ...(t.esperaDias > 0 ? { esperaAntesMs: t.esperaDias * DIA_MS } : {}),
            texto: t.texto.trim(),
            rotulo: t.rotulo.trim() || `Mensagem ${i + 1}`,
          })),
        }
      : null;
  const jornada = spec ? jornadaDaEscada(spec) : null;
  const simulacao = spec ? simularEscada(spec, reacoes.slice(0, comTexto.length)) : null;

  function salvar() {
    if (nome.trim().length < 3) {
      toast.error("Dê um nome ao fluxo (mínimo 3 letras).");
      return;
    }
    if (!spec) {
      toast.error("Escreva ao menos uma mensagem.");
      return;
    }
    start(async () => {
      const r = await criarFollowupSimples({
        nome: nome.trim(),
        gatilho,
        toques: comTexto.map((t) => ({ texto: t.texto.trim(), esperaDias: t.esperaDias, rotulo: t.rotulo.trim() || undefined })),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Fluxo criado como rascunho. Revise e publique quando quiser.");
      router.push("/app/ai/followups");
    });
  }

  return (
    <div className="gip-ambient-bg mx-auto max-w-[1040px] px-4 py-7 space-y-5">
      <CommandHero
        eyebrow="Relacionamento · Follow-up"
        titulo="Criar um follow-up simples"
        subtitulo="Escreva as mensagens e os prazos. Você vê a jornada acontecer ao lado. Nasce como rascunho — ninguém recebe nada até você publicar."
        acoes={[{ href: "/app/ai/followups", label: "← Follow-ups" }]}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── Coluna 1: o formulário ─────────────────────────────── */}
        <div className="space-y-4">
          <div className="gip-glass space-y-3 p-5">
            <div>
              <label className="mb-1.5 block text-sm font-semibold">Nome do fluxo</label>
              <input
                className="wr-input w-full"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Boas-vindas do bairro"
              />
            </div>
            <div>
              <p className="mb-1.5 text-sm font-semibold">Quando ele começa</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                {([
                  { v: "lead_created", t: "Quando um novo contato entra" },
                  { v: "manual", t: "Quando eu inscrever a pessoa" },
                ] as const).map((g) => {
                  const on = gatilho === g.v;
                  return (
                    <button
                      key={g.v}
                      type="button"
                      onClick={() => setGatilho(g.v)}
                      className="flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
                      style={{
                        background: on ? "var(--color-accent)" : "var(--color-surface-elevated)",
                        color: on ? "#16181D" : "var(--color-text-muted)",
                        border: "1px solid var(--color-border)",
                      }}
                    >
                      {g.t}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {toques.map((t, i) => (
            <div key={i} className="gip-glass space-y-2.5 p-4">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-sm font-semibold">
                  <MessageCircle className="h-4 w-4" style={{ color: "var(--accent-ink, var(--color-accent))" }} aria-hidden />
                  Mensagem {i + 1}
                </span>
                {toques.length > 1 && (
                  <button type="button" onClick={() => removerToque(i)} className="opacity-60 hover:opacity-100" style={{ color: "#E08079" }} aria-label="remover">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              {i > 0 && (
                <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
                  <Clock className="h-4 w-4" aria-hidden /> Esperar
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={t.esperaDias}
                    onChange={(e) => setToque(i, { esperaDias: Math.max(1, Math.min(90, Number(e.target.value) || 1)) })}
                    className="wr-input"
                    style={{ width: 72 }}
                  />
                  dias antes de mandar
                </div>
              )}
              <textarea
                className="wr-input w-full"
                rows={3}
                value={t.texto}
                onChange={(e) => setToque(i, { texto: e.target.value })}
                placeholder="O que o cidadão vai ler. Sem prometer nada — acolha e ofereça."
              />
            </div>
          ))}

          <button
            type="button"
            onClick={addToque}
            disabled={toques.length >= 5}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-3 text-sm font-bold disabled:opacity-40"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
          >
            <Plus className="h-4 w-4" /> Adicionar outra mensagem
          </button>

          <div className="flex items-center gap-2">
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Salvar como rascunho
            </Button>
          </div>
        </div>

        {/* ── Coluna 2: a jornada + o teste ──────────────────────── */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div className="gip-glass p-5">
            <p className="mb-1 text-sm font-semibold">A jornada</p>
            <p className="mb-3 text-xs" style={{ color: "var(--color-text-subtle)" }}>
              {jornada ? jornada.horizonteTexto : "Escreva uma mensagem para ver a jornada."}
            </p>
            {jornada && (
              <ol className="space-y-3">
                {jornada.momentos.map((m) => (
                  <li key={m.ordem} className="rounded-xl p-3" style={{ background: "color-mix(in srgb, var(--color-text) 4%, transparent)" }}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>
                      {m.ordem}. {m.quando}
                    </p>
                    <p className="mt-1 text-sm" style={{ color: "var(--color-text)" }}>{m.mensagem}</p>
                    <ul className="mt-2 space-y-0.5 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                      <li>✅ Se responder: {m.seResponderSim}</li>
                      <li>↩️ Se responder outra coisa: {m.seResponderOutro}</li>
                      <li>⏭️ Se não responder: {m.seNaoResponder}</li>
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {spec && (
            <div className="gip-glass p-5">
              <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
                <Flag className="h-4 w-4" style={{ color: "var(--accent-ink, var(--color-accent))" }} aria-hidden /> Testar um cenário
              </p>
              <p className="mb-3 text-xs" style={{ color: "var(--color-text-subtle)" }}>
                Escolha o que o cidadão faz a cada mensagem e veja o caminho.
              </p>
              <div className="space-y-2">
                {comTexto.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="shrink-0" style={{ color: "var(--color-text-subtle)" }}>Msg {i + 1}:</span>
                    <select
                      className="wr-input w-full"
                      value={reacoes[i] ?? "ignora"}
                      onChange={(e) => setReacoes((a) => a.map((r, j) => (j === i ? (e.target.value as Reacao) : r)))}
                    >
                      {(["ignora", "responde_sim", "responde_outro"] as Reacao[]).map((r) => (
                        <option key={r} value={r}>{REACAO_LABEL[r]}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              {simulacao && (
                <div className="mt-3 rounded-xl p-3" style={{ background: "color-mix(in srgb, var(--color-accent) 10%, transparent)" }}>
                  <ol className="space-y-1 text-[13px]" style={{ color: "var(--color-text)" }}>
                    {simulacao.passos.map((p, k) => (
                      <li key={k}>• <span style={{ color: "var(--color-text-subtle)" }}>{p.quando}:</span> {p.acao}</li>
                    ))}
                  </ol>
                  <p className="mt-2 text-sm font-semibold" style={{ color: "var(--accent-ink, var(--color-accent))" }}>
                    Desfecho: {simulacao.desfecho} · {simulacao.mensagensRecebidas} mensagem{simulacao.mensagensRecebidas === 1 ? "" : "s"}.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
