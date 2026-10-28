"use client";

import { useMemo, useState } from "react";

export interface Pergunta {
  id: string;
  question: string;
  response_type: "text" | "choice" | "scale" | "boolean" | "number" | "date" | "multi_choice";
  options: unknown;
  required: boolean;
  order: number;
}

const ACCENT = "#D7F36A";
const SURFACE = "#13161C";
const BORDER = "#262B36";

function opcoesDe(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((o) => String(o));
  if (raw && typeof raw === "object" && Array.isArray((raw as { options?: unknown[] }).options)) {
    return ((raw as { options: unknown[] }).options).map((o) => String(o));
  }
  return [];
}

function escalaMax(raw: unknown): number {
  if (raw && typeof raw === "object" && typeof (raw as { max?: number }).max === "number") {
    return Math.min(10, Math.max(2, (raw as { max: number }).max));
  }
  return 5;
}

const campoStyle: React.CSSProperties = {
  width: "100%",
  background: "#0E1116",
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  color: "#E9EBF0",
  padding: "10px 12px",
  fontSize: 15,
  outline: "none",
};

export default function PesquisaForm({
  token,
  titulo,
  descricao,
  perguntas,
}: {
  token: string;
  titulo: string;
  descricao: string | null;
  perguntas: Pergunta[];
}) {
  const inicio = useMemo(() => Date.now(), []);
  const [resp, setResp] = useState<Record<string, unknown>>({});
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  function set(id: string, v: unknown) {
    setResp((p) => ({ ...p, [id]: v }));
  }

  function toggleMulti(id: string, opt: string) {
    setResp((p) => {
      const atual = Array.isArray(p[id]) ? (p[id] as string[]) : [];
      return { ...p, [id]: atual.includes(opt) ? atual.filter((o) => o !== opt) : [...atual, opt] };
    });
  }

  async function enviar() {
    setErro(null);
    for (const q of perguntas) {
      if (!q.required) continue;
      const v = resp[q.id];
      const vazio = v == null || v === "" || (Array.isArray(v) && v.length === 0);
      if (vazio) {
        setErro("Responda todas as perguntas obrigatórias (*).");
        return;
      }
    }
    setEnviando(true);
    try {
      const res = await fetch(`/api/v1/pol-surveys/public/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: resp,
          city: cidade.trim() || null,
          state: estado.trim().toUpperCase().slice(0, 2) || null,
          duration_seconds: Math.round((Date.now() - inicio) / 1000),
        }),
      });
      if (!res.ok) throw new Error("falha");
      setPronto(true);
    } catch {
      setErro("Não consegui enviar agora. Tente de novo em instantes.");
    } finally {
      setEnviando(false);
    }
  }

  if (pronto) {
    return (
      <div style={{ textAlign: "center", padding: "56px 0" }}>
        <div style={{ fontSize: 44 }}>✅</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 12 }}>Resposta enviada!</h1>
        <p style={{ color: "#9AA0AE", marginTop: 8, fontSize: 15 }}>Muito obrigado por participar. Sua opinião faz a diferença. 🙏</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.2 }}>{titulo}</h1>
      {descricao && <p style={{ color: "#9AA0AE", marginTop: 8, fontSize: 15 }}>{descricao}</p>}

      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 18 }}>
        {perguntas.map((q, i) => {
          const opts = opcoesDe(q.options);
          const val = resp[q.id];
          return (
            <div key={q.id} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 18 }}>
              <label style={{ display: "block", fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
                {i + 1}. {q.question}
                {q.required && <span style={{ color: ACCENT }}> *</span>}
              </label>

              {q.response_type === "text" && (
                <textarea rows={3} style={{ ...campoStyle, resize: "vertical" }} value={(val as string) ?? ""} onChange={(e) => set(q.id, e.target.value)} />
              )}
              {q.response_type === "number" && (
                <input type="number" style={campoStyle} value={(val as number) ?? ""} onChange={(e) => set(q.id, e.target.value === "" ? "" : Number(e.target.value))} />
              )}
              {q.response_type === "date" && (
                <input type="date" style={campoStyle} value={(val as string) ?? ""} onChange={(e) => set(q.id, e.target.value)} />
              )}
              {q.response_type === "boolean" && (
                <div style={{ display: "flex", gap: 10 }}>
                  {[{ k: true, t: "Sim" }, { k: false, t: "Não" }].map((o) => {
                    const on = val === o.k;
                    return (
                      <button key={o.t} type="button" onClick={() => set(q.id, o.k)} style={{ flex: 1, padding: "10px 0", borderRadius: 12, fontWeight: 700, cursor: "pointer", border: `1px solid ${on ? ACCENT : BORDER}`, background: on ? ACCENT : "#0E1116", color: on ? "#1B2206" : "#E9EBF0" }}>
                        {o.t}
                      </button>
                    );
                  })}
                </div>
              )}
              {q.response_type === "scale" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {Array.from({ length: escalaMax(q.options) }, (_, n) => n + 1).map((n) => {
                    const on = val === n;
                    return (
                      <button key={n} type="button" onClick={() => set(q.id, n)} style={{ width: 44, height: 44, borderRadius: 12, fontWeight: 700, cursor: "pointer", border: `1px solid ${on ? ACCENT : BORDER}`, background: on ? ACCENT : "#0E1116", color: on ? "#1B2206" : "#E9EBF0" }}>
                        {n}
                      </button>
                    );
                  })}
                </div>
              )}
              {q.response_type === "choice" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {opts.map((o) => {
                    const on = val === o;
                    return (
                      <button key={o} type="button" onClick={() => set(q.id, o)} style={{ textAlign: "left", padding: "10px 12px", borderRadius: 12, cursor: "pointer", fontSize: 15, border: `1px solid ${on ? ACCENT : BORDER}`, background: on ? "rgba(215,243,106,0.12)" : "#0E1116", color: "#E9EBF0" }}>
                        {on ? "●" : "○"} {o}
                      </button>
                    );
                  })}
                </div>
              )}
              {q.response_type === "multi_choice" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {opts.map((o) => {
                    const on = Array.isArray(val) && (val as string[]).includes(o);
                    return (
                      <button key={o} type="button" onClick={() => toggleMulti(q.id, o)} style={{ textAlign: "left", padding: "10px 12px", borderRadius: 12, cursor: "pointer", fontSize: 15, border: `1px solid ${on ? ACCENT : BORDER}`, background: on ? "rgba(215,243,106,0.12)" : "#0E1116", color: "#E9EBF0" }}>
                        {on ? "☑" : "☐"} {o}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Localização (opcional) — útil pra leitura territorial */}
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 18 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#9AA0AE", marginBottom: 10 }}>De onde você fala? (opcional)</label>
          <div style={{ display: "flex", gap: 10 }}>
            <input placeholder="Cidade" style={{ ...campoStyle, flex: 1 }} value={cidade} onChange={(e) => setCidade(e.target.value)} />
            <input placeholder="UF" maxLength={2} style={{ ...campoStyle, width: 72, textTransform: "uppercase" }} value={estado} onChange={(e) => setEstado(e.target.value)} />
          </div>
        </div>
      </div>

      {erro && <p style={{ color: "#F87171", fontSize: 14, marginTop: 14 }}>{erro}</p>}

      <button type="button" onClick={enviar} disabled={enviando} style={{ marginTop: 18, width: "100%", padding: "14px 0", borderRadius: 999, fontSize: 16, fontWeight: 800, cursor: enviando ? "default" : "pointer", border: "none", background: ACCENT, color: "#1B2206", opacity: enviando ? 0.6 : 1 }}>
        {enviando ? "Enviando…" : "Enviar resposta"}
      </button>
      <p style={{ textAlign: "center", color: "#5B6170", fontSize: 12, marginTop: 14 }}>Suas respostas são confidenciais e usadas só para a pesquisa.</p>
    </div>
  );
}
