"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Send, Loader2, ShieldAlert, Info } from "lucide-react";

import { CommandHero } from "@/components/politico/command-hero";
import { prepararDisparoDaPesquisa, type SegmentoPesquisa } from "@/app/actions/politico/pesquisa-disparo";
import { VARIAVEL_LINK } from "@/lib/politico/pesquisa-link";

const NIVEIS: { v: SegmentoPesquisa["niveis"][number]; l: string }[] = [
  { v: "novo_cadastro", l: "Novo cadastro" },
  { v: "simpatizante", l: "Simpatizante" },
  { v: "apoiador", l: "Apoiador" },
  { v: "militante", l: "Militante" },
  { v: "voto_certo", l: "Voto certo" },
];
const TEMPS: { v: SegmentoPesquisa["temperaturas"][number]; l: string }[] = [
  { v: "frio", l: "Frio" },
  { v: "morno", l: "Morno" },
  { v: "quente", l: "Quente" },
];

export default function DispararClient({ surveyId, titulo, numPerguntas, nomeMandato }: {
  surveyId: string;
  titulo: string;
  numPerguntas: number;
  nomeMandato: string | null;
}) {
  const router = useRouter();
  const nome = nomeMandato?.trim() || "o gabinete";
  const [niveis, setNiveis] = useState<SegmentoPesquisa["niveis"]>([]);
  const [temps, setTemps] = useState<SegmentoPesquisa["temperaturas"]>([]);
  const [limite, setLimite] = useState(500);
  const [mensagem, setMensagem] = useState(
    `Oi {{primeiro_nome}}! 👋 ${nome} quer te ouvir. Responde essa pesquisa rápida (2 min) e ajude a definir as prioridades: ${VARIAVEL_LINK} 🙏`,
  );
  const [confirmaTse, setConfirmaTse] = useState(false);
  const [precisaTse, setPrecisaTse] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function toggle<T>(arr: T[], v: T): T[] {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  }

  async function preparar() {
    setErro(null);
    setEnviando(true);
    const r = await prepararDisparoDaPesquisa({
      surveyId,
      segmento: { niveis, temperaturas: temps, limite },
      mensagem,
      confirmaTse,
    });
    setEnviando(false);
    if (!r.ok) {
      if (r.precisaTse) { setPrecisaTse(true); setErro(r.erro); return; }
      setErro(r.erro);
      return;
    }
    // Vai pro Disparos revisar + enviar (trilho seguro: ritmo, opt-out, pré-go-live).
    router.push(`/app/campaigns/${r.campaignId}`);
  }

  const semPergunta = numPerguntas === 0;
  const chip = (ativo: boolean) =>
    `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${ativo ? "" : ""}`;

  return (
    <div className="mx-auto max-w-[760px] px-4 py-7 space-y-5" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Inteligência · Pesquisa"
        titulo="Disparar pesquisa"
        subtitulo={`"${titulo}" — escolha o público e a mensagem. O envio acontece no Disparos, no ritmo seguro.`}
        acoes={[{ href: "/app/politico/pesquisas", label: "← Pesquisas" }]}
      />

      {semPergunta ? (
        <div className="wr-card p-5 text-sm" style={{ color: "var(--color-text-muted)" }}>
          Esta pesquisa ainda não tem perguntas.{" "}
          <Link href={`/app/politico/pesquisas/${surveyId}/editar`} className="font-semibold underline">Monte as perguntas</Link> antes de disparar.
        </div>
      ) : (
        <>
          <div className="wr-card space-y-4 p-5">
            <p className="text-sm font-semibold">1. Quem vai receber</p>
            <div>
              <p className="mb-1.5 text-xs font-medium" style={{ color: "var(--color-text-subtle)" }}>Nível no funil</p>
              <div className="flex flex-wrap gap-2">
                {NIVEIS.map((n) => {
                  const on = niveis.includes(n.v);
                  return (
                    <button key={n.v} type="button" onClick={() => setNiveis((a) => toggle(a, n.v))}
                      className={chip(on)}
                      style={{ background: on ? "#D7F36A" : "var(--color-surface-elevated)", color: on ? "#16181D" : "var(--color-text-muted)", border: "1px solid var(--color-border)" }}>
                      {n.l}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium" style={{ color: "var(--color-text-subtle)" }}>Temperatura</p>
              <div className="flex flex-wrap gap-2">
                {TEMPS.map((tt) => {
                  const on = temps.includes(tt.v);
                  return (
                    <button key={tt.v} type="button" onClick={() => setTemps((a) => toggle(a, tt.v))}
                      className={chip(on)}
                      style={{ background: on ? "#D7F36A" : "var(--color-surface-elevated)", color: on ? "#16181D" : "var(--color-text-muted)", border: "1px solid var(--color-border)" }}>
                      {tt.l}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium" style={{ color: "var(--color-text-subtle)" }}>Máximo de pessoas (lote)</p>
              <input type="number" min={1} max={5000} value={limite} onChange={(e) => setLimite(Math.max(1, Math.min(5000, Number(e.target.value) || 1)))} className="wr-input" style={{ width: 160 }} />
            </div>
            <div className="flex items-start gap-2 rounded-lg p-2.5 text-xs" style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }}>
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Descadastrados e números bloqueados são <strong>excluídos automaticamente</strong>. Escolha ao menos um nível ou temperatura.</span>
            </div>
          </div>

          <div className="wr-card space-y-3 p-5">
            <p className="text-sm font-semibold">2. A mensagem</p>
            <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
              Use <code>{"{{primeiro_nome}}"}</code> e <code>{VARIAVEL_LINK}</code> (o link único de cada pessoa) — são trocados automaticamente.
            </p>
            <textarea className="wr-input w-full" rows={5} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
            <div className="rounded-lg p-3 text-sm" style={{ background: "#1a472a", color: "#dcfce7", maxWidth: 420 }}>
              {mensagem.replace("{{primeiro_nome}}", "Maria").replace(VARIAVEL_LINK, "warromcleitonxavier.cloud/pesquisa/abc123")}
            </div>
          </div>

          {precisaTse && (
            <div className="wr-card space-y-2 p-5" style={{ border: "1px solid rgba(224,128,121,0.4)" }}>
              <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: "#A3302A" }}><ShieldAlert className="h-4 w-4" /> Intenção de voto — confirmação</p>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={confirmaTse} onChange={(e) => setConfirmaTse(e.target.checked)} className="mt-1" />
                <span>Confirmo que esta pesquisa é de <strong>uso interno</strong> (sentir a base). Para divulgar o resultado publicamente, é preciso registrar no TSE.</span>
              </label>
            </div>
          )}

          {erro && <p className="text-sm" style={{ color: "#E08079" }}>{erro}</p>}

          <div className="flex items-center gap-2">
            <button type="button" onClick={preparar} disabled={enviando || (precisaTse && !confirmaTse)} className="wr-btn-dark inline-flex items-center gap-2 disabled:opacity-60">
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {enviando ? "Preparando…" : "Preparar disparo → revisar no Disparos"}
            </button>
            <Link href="/app/politico/pesquisas" className="wr-btn">Cancelar</Link>
          </div>
          <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
            Ao preparar, montamos a lista e o link de cada pessoa e criamos um disparo pronto. O <strong>envio</strong> você revisa e aciona no Disparos (ritmo que não queima o número, canal em modo seguro).
          </p>
        </>
      )}
    </div>
  );
}
