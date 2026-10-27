"use client";

/**
 * "Pergunte ao GIP" — chat de inteligência política. A IA roteia para as nossas
 * ferramentas de dados (voto TSE, território, cadeiras, opinião pública, base) e
 * responde ancorada no número real. Nada inventado.
 */

import { useRef, useState, useTransition, useEffect } from "react";
import { Sparkles, ArrowUp, Wrench } from "lucide-react";

import { MiniMarkdown } from "@/components/politico/mini-markdown";
import { perguntarGip, type GipMsg } from "@/app/actions/politico/perguntarGip";

interface Turno extends GipMsg { ferramentas?: string[] }

const ROTULO_FERRAMENTA: Record<string, string> = {
  buscar_candidato: "busca de candidato",
  votacao_candidato: "votação (TSE)",
  peso_do_bairro: "força no bairro",
  projecao_cadeiras: "projeção de cadeiras",
  opiniao_publica: "opinião pública",
  minha_base_no_bairro: "sua base de contatos",
};

export default function GipClient({ mandatoNome, cidade }: { mandatoNome: string | null; cidade: string | null }) {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [input, setInput] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pensando, start] = useTransition();
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: "smooth" }); }, [turnos, pensando]);

  const quem = mandatoNome || "seu candidato";
  const ondeCidade = cidade || "sua cidade";
  const sugestoes = [
    `Onde ${quem} foi mais forte em ${ondeCidade}?`,
    "Quantos votos preciso para pegar uma cadeira?",
    "Como está a opinião pública sobre segurança?",
    `Qual a minha força e a minha base no bairro Centro?`,
  ];

  function enviar(texto: string) {
    const q = texto.trim();
    if (!q || pensando) return;
    setErro(null);
    const historico: GipMsg[] = turnos.map((t) => ({ role: t.role, content: t.content }));
    setTurnos((ts) => [...ts, { role: "user", content: q }]);
    setInput("");
    start(async () => {
      const r = await perguntarGip(q, historico);
      if (!r.ok) { setErro(r.erro); return; }
      setTurnos((ts) => [...ts, { role: "assistant", content: r.texto, ferramentas: r.ferramentas }]);
    });
  }

  const vazio = turnos.length === 0;

  return (
    <div className="mx-auto flex h-[calc(100vh-120px)] max-w-[840px] flex-col px-4 py-6">
      {/* Cabeçalho */}
      <header className="mb-4 flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "rgba(215,243,106,0.16)", color: "#7E8F2B" }} aria-hidden><Sparkles className="h-5 w-5" /></span>
        <div>
          <h1 className="font-heading text-[24px] font-bold leading-tight" style={{ color: "var(--color-text)" }}>Pergunte ao GIP</h1>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Pergunte à vontade. Eu cruzo voto, território, cadeiras, opinião e a sua base pra te responder na hora.</p>
        </div>
      </header>

      {/* Conversa */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {vazio ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Sparkles className="h-10 w-10" style={{ color: "rgba(215,243,106,0.5)" }} aria-hidden />
            <p className="mt-4 max-w-md text-sm" style={{ color: "var(--color-text-subtle)" }}>
              Respostas ancoradas nos SEUS dados reais (votos do TSE + sua base de contatos). Comece com uma pergunta:
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {sugestoes.map((s) => (
                <button key={s} type="button" onClick={() => enviar(s)} className="rounded-full px-3.5 py-2 text-sm transition-colors hover:opacity-80" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>{s}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 pb-2">
            {turnos.map((t, i) => (
              t.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm" style={{ background: "#D7F36A", color: "#16181D" }}>{t.content}</div>
                </div>
              ) : (
                <div key={i} className="flex flex-col gap-1.5">
                  {t.ferramentas && t.ferramentas.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Wrench className="h-3 w-3" style={{ color: "var(--color-text-subtle)" }} aria-hidden />
                      {t.ferramentas.map((f) => <span key={f} className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "rgba(96,165,250,0.12)", color: "#60A5FA" }}>{ROTULO_FERRAMENTA[f] ?? f}</span>)}
                    </div>
                  )}
                  <div className="max-w-[88%] rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
                    <MiniMarkdown texto={t.content} />
                  </div>
                </div>
              )
            ))}
            {pensando && (
              <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text-subtle)" }}>
                <span className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full" style={{ background: "#D7F36A", animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full" style={{ background: "#D7F36A", animationDelay: "120ms" }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full" style={{ background: "#D7F36A", animationDelay: "240ms" }} />
                </span>
                consultando os dados…
              </div>
            )}
            <div ref={fimRef} />
          </div>
        )}
      </div>

      {erro && <div className="mt-2 rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(248,113,113,0.1)", color: "#F87171" }}>{erro}</div>}

      {/* Input */}
      <form onSubmit={(e) => { e.preventDefault(); enviar(input); }} className="mt-3 flex items-end gap-2 rounded-2xl p-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--color-border)" }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(input); } }}
          placeholder="Pergunte ao GIP…"
          rows={1}
          className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
          style={{ color: "var(--color-text)" }}
        />
        <button type="submit" disabled={pensando || !input.trim()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full disabled:opacity-40" style={{ background: "#D7F36A", color: "#16181D" }} aria-label="Enviar">
          <ArrowUp className="h-4 w-4" />
        </button>
      </form>
      <p className="mt-1.5 text-center text-[11px]" style={{ color: "var(--color-text-subtle)" }}>O GIP responde só com os seus dados reais (votos do TSE + sua base de contatos). Confira números sensíveis antes de divulgar.</p>
    </div>
  );
}
