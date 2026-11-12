"use client";

/**
 * Formulário da Nota do cidadão: cinco botões grandes (1 a 5, com a palavra
 * embaixo) e um campo opcional. Pensado para o celular e para quem tem pouca
 * intimidade com tela: um toque escolhe, um toque envia.
 */
import { useState } from "react";

import { NOTA_MAX, ROTULO_DA_NOTA } from "@/lib/politico/avaliacao-texto";

const NOTAS = Array.from({ length: NOTA_MAX }, (_, i) => i + 1);
// Vermelho → verde, do pior ao melhor. A palavra embaixo diz o mesmo (nunca só cor).
const COR: Record<number, string> = { 1: "#F87171", 2: "#FB923C", 3: "#FACC15", 4: "#A3E635", 5: "#4ADE80" };

export function AvaliarForm({ token, primeiroNome, gabinete }: { token: string; primeiroNome: string; gabinete: string }) {
  const [nota, setNota] = useState<number | null>(null);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar() {
    if (nota === null) {
      setErro("Toque em uma das notas antes de enviar.");
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const r = await fetch(`/api/v1/avaliar/public/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nota, comentario: comentario.trim() || null }),
      });
      // 409 = já tinha respondido (dois toques, duas abas): para a pessoa, deu certo.
      if (!r.ok && r.status !== 409) throw new Error("falha");
      setPronto(true);
    } catch {
      setErro("Não consegui salvar agora. Tente de novo em instantes.");
    } finally {
      setEnviando(false);
    }
  }

  if (pronto) {
    return (
      <div style={{ background: "#13233a", border: "1px solid rgba(215,243,106,0.4)", borderRadius: 18, padding: "36px 24px", textAlign: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>Obrigado{primeiroNome ? `, ${primeiroNome}` : ""}!</h1>
        <p style={{ color: "#a7b6c9", fontSize: 15, margin: 0 }}>
          Sua resposta foi registrada e ajuda o {gabinete} a atender melhor. Pode fechar esta página.
        </p>
      </div>
    );
  }

  return (
    <div style={{ background: "#13233a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: "28px 20px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px" }}>{primeiroNome ? `Oi, ${primeiroNome}!` : "Oi!"}</h1>
      <p style={{ color: "#a7b6c9", fontSize: 15, margin: "0 0 20px" }}>
        Como foi o atendimento do {gabinete}? Toque em uma nota.
      </p>

      <div role="radiogroup" aria-label="Nota do atendimento, de 1 a 5" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 8 }}>
        {NOTAS.map((n) => {
          const sel = nota === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={sel}
              aria-label={`Nota ${n}: ${ROTULO_DA_NOTA[n]}`}
              onClick={() => { setNota(n); setErro(null); }}
              style={{
                borderRadius: 14,
                border: sel ? `2px solid ${COR[n]}` : "1px solid rgba(255,255,255,0.14)",
                background: sel ? COR[n] : "#0e1c30",
                color: sel ? "#0b1726" : "#eaf0f6",
                fontWeight: 800,
                fontSize: 24,
                padding: "14px 0",
                minHeight: 60,
                cursor: "pointer",
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#8ea2bd", marginBottom: 6 }}>
        <span>{ROTULO_DA_NOTA[1]}</span>
        <span>{ROTULO_DA_NOTA[NOTA_MAX]}</span>
      </div>
      <p aria-live="polite" style={{ minHeight: 22, textAlign: "center", fontWeight: 700, fontSize: 15, margin: "0 0 16px", color: nota ? COR[nota] : "transparent" }}>
        {nota ? ROTULO_DA_NOTA[nota] : "—"}
      </p>

      <label htmlFor="comentario" style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#a7b6c9", marginBottom: 6 }}>
        Quer contar o motivo? (opcional)
      </label>
      <textarea
        id="comentario"
        value={comentario}
        onChange={(e) => setComentario(e.target.value.slice(0, 600))}
        rows={3}
        placeholder="Escreva aqui, se quiser."
        style={{ width: "100%", boxSizing: "border-box", borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)", background: "#0e1c30", color: "#eaf0f6", padding: "12px 14px", fontSize: 15, outline: "none", resize: "vertical", marginBottom: 18, fontFamily: "inherit" }}
      />

      {erro && <p role="alert" style={{ color: "#ff9b8d", fontSize: 14, margin: "0 0 14px" }}>{erro}</p>}

      <button
        type="button"
        onClick={() => void enviar()}
        disabled={enviando}
        style={{ width: "100%", borderRadius: 999, border: "none", background: "#D7F36A", color: "#16181D", fontWeight: 800, fontSize: 16, padding: "14px", cursor: enviando ? "default" : "pointer", opacity: enviando ? 0.7 : 1 }}
      >
        {enviando ? "Enviando…" : "Enviar avaliação"}
      </button>
      <p style={{ color: "#6d7f98", fontSize: 12, textAlign: "center", margin: "14px 0 0" }}>
        Sua resposta é usada só para melhorar o atendimento do gabinete.
      </p>
    </div>
  );
}
