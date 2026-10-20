"use client";

/**
 * Render mínimo do markdown que a IA devolve: # títulos, **negrito**, bullets e
 * parágrafos. Sem dependência nova. Usado pelas leituras estratégicas (Arena,
 * Projeção). Cores no tema dark tático da marca.
 */

export function MiniMarkdown({ texto }: { texto: string }) {
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((p, j) =>
      /^\*\*[^*]+\*\*$/.test(p) ? <strong key={j} style={{ color: "var(--color-text)" }}>{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>,
    );
  const bloco = (linha: string, i: number) => {
    const h = linha.match(/^\s*(#{1,3})\s+(.*)$/);
    if (h) {
      const txt = h[2]!.replace(/\*\*/g, "");
      return h[1]!.length === 1
        ? <h3 key={i} className="mb-1 font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>{txt}</h3>
        : <h4 key={i} className="mt-3 mb-1 font-heading text-sm font-bold" style={{ color: "#D7F36A" }}>{txt}</h4>;
    }
    const partes = linha.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    const soNegrito = partes.length === 1 && /^\*\*[^*]+\*\*$/.test(partes[0]!);
    const bullet = /^\s*[-*]\s+/.test(linha);
    if (soNegrito) return <h4 key={i} className="mt-3 mb-1 font-heading text-sm font-bold" style={{ color: "#D7F36A" }}>{partes[0]!.slice(2, -2)}</h4>;
    if (bullet) return <li key={i} className="ml-4 list-disc text-sm leading-relaxed" style={{ color: "var(--color-text-muted)" }}>{inline(linha.replace(/^\s*[-*]\s+/, ""))}</li>;
    if (linha.trim() === "") return <div key={i} className="h-1.5" />;
    return <p key={i} className="text-sm leading-relaxed" style={{ color: "var(--color-text-muted)" }}>{inline(linha)}</p>;
  };
  return <div className="space-y-0.5">{texto.split("\n").map(bloco)}</div>;
}
