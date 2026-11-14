"use client";

/**
 * BotaoRequerimento — redige o REQUERIMENTO DE COMISSÃO (visita técnica ou
 * audiência pública) de uma visita do gabinete, no padrão de redação oficial.
 *
 * O texto nasce numa janela, EDITÁVEL, e sai por "Copiar": o requerimento é
 * protocolado no sistema da Casa, não por aqui. Nada é gravado nem enviado.
 * A comissão e o artigo do regimento são de cada Casa — a equipe digita uma vez
 * e o navegador lembra.
 */
import { useState, useTransition } from "react";
import { Check, Copy, FileSignature, Loader2, Sparkles, X } from "lucide-react";

import { gerarRequerimentoDeComissao } from "@/app/actions/politico/gerarEncaminhamento";

const CHAVE = "gip:requerimento";

function lembrado(): { comissao: string; dispositivo: string } {
  try {
    const v = JSON.parse(window.localStorage.getItem(CHAVE) ?? "{}") as { comissao?: unknown; dispositivo?: unknown };
    return {
      comissao: typeof v.comissao === "string" ? v.comissao : "",
      dispositivo: typeof v.dispositivo === "string" ? v.dispositivo : "",
    };
  } catch {
    return { comissao: "", dispositivo: "" };
  }
}

export function BotaoRequerimento({ demandaId, assunto }: { demandaId: string; assunto: string | null }) {
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<"visita_tecnica" | "audiencia_publica">("visita_tecnica");
  const [comissao, setComissao] = useState("");
  const [dispositivo, setDispositivo] = useState("");
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pending, start] = useTransition();

  function abrir() {
    const l = lembrado();
    setComissao(l.comissao);
    setDispositivo(l.dispositivo);
    setTexto("");
    setErro(null);
    setCopiado(false);
    setAberto(true);
  }

  function gerar() {
    setErro(null);
    setCopiado(false);
    try {
      window.localStorage.setItem(CHAVE, JSON.stringify({ comissao, dispositivo }));
    } catch {
      /* navegador sem armazenamento: só não lembra da próxima vez */
    }
    start(async () => {
      const r = await gerarRequerimentoDeComissao(demandaId, { tipo, comissao, dispositivo });
      if (r.ok) setTexto(r.texto);
      else setErro(r.erro);
    });
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro("Não consegui copiar. Selecione o texto e copie à mão.");
    }
  }

  const temLacuna = /\[[^\]\n]{3,}\]/.test(texto);

  return (
    <>
      <button type="button" onClick={abrir} className="wr-btn inline-flex items-center gap-1.5 text-sm">
        <FileSignature className="h-4 w-4" aria-hidden /> Requerimento
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => !pending && setAberto(false)}
        >
          <div
            className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-2xl p-4 sm:p-5"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>
                  Requerimento de comissão
                </h3>
                {assunto ? (
                  <p className="mt-0.5 text-sm" style={{ color: "var(--color-text-muted)" }}>{assunto}</p>
                ) : null}
              </div>
              <button type="button" onClick={() => !pending && setAberto(false)} className="rounded-full p-1" style={{ color: "var(--color-text-subtle)" }} aria-label="Fechar">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
              <div className="flex flex-wrap gap-2">
                {([
                  ["visita_tecnica", "Visita técnica"],
                  ["audiencia_publica", "Audiência pública"],
                ] as const).map(([v, rotulo]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setTipo(v)}
                    aria-pressed={tipo === v}
                    className="rounded-full px-3.5 py-1.5 text-sm font-semibold"
                    style={
                      tipo === v
                        ? { background: "var(--chip-active-bg)", color: "var(--chip-active-fg)" }
                        : { background: "var(--color-surface-elevated)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }
                    }
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
              <label className="block text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                Comissão
                <input
                  value={comissao}
                  onChange={(e) => setComissao(e.target.value)}
                  maxLength={200}
                  className="wr-input mt-1 w-full font-normal"
                  placeholder="Ex.: Comissão de Meio Ambiente e Política Urbana"
                />
              </label>
              <label className="block text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                Artigo do regimento
                <input
                  value={dispositivo}
                  onChange={(e) => setDispositivo(e.target.value)}
                  maxLength={200}
                  className="wr-input mt-1 w-full font-normal"
                  placeholder="Ex.: art. 48 do Regimento Interno"
                />
              </label>

              <button type="button" onClick={gerar} disabled={pending} className="wr-btn-dark inline-flex items-center gap-2 disabled:opacity-60">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
                {pending ? "Redigindo…" : texto ? "Redigir de novo" : "Redigir com IA"}
              </button>

              {erro ? (
                <p className="text-sm font-semibold" style={{ color: "#C82333" }} role="alert">{erro}</p>
              ) : null}

              {texto ? (
                <>
                  <textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    rows={14}
                    className="wr-input w-full text-sm leading-relaxed"
                    aria-label="Texto do requerimento"
                  />
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {temLacuna
                      ? "O que está entre [COLCHETES] a IA não sabia: preencha antes de protocolar."
                      : "Revise antes de protocolar. O número é dado pela Casa no protocolo."}
                  </p>
                </>
              ) : null}
            </div>

            {texto ? (
              <div className="mt-3 flex justify-end border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
                <button type="button" onClick={copiar} className="wr-btn-dark inline-flex items-center gap-2">
                  {copiado ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                  {copiado ? "Copiado" : "Copiar texto"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
