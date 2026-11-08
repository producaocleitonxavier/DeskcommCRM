"use client";

import { useState } from "react";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
// Dias por mês (ano sentinela 2000 é bissexto → fevereiro 29).
const DIAS_NO_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const campo: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "#0e1c30",
  color: "#eaf0f6",
  padding: "13px 14px",
  fontSize: 15,
  outline: "none",
};
const rotulo: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#8ea2bd",
  marginBottom: 6,
};

export function PerfilForm({
  token,
  primeiroNome,
  cidadeInicial,
  bairroInicial,
  diaInicial,
  mesInicial,
}: {
  token: string;
  primeiroNome: string;
  cidadeInicial: string;
  bairroInicial: string;
  diaInicial: string;
  mesInicial: string;
}) {
  const [cidade, setCidade] = useState(cidadeInicial);
  const [bairro, setBairro] = useState(bairroInicial);
  const [mes, setMes] = useState(mesInicial);
  const [dia, setDia] = useState(diaInicial);
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const maxDia = mes ? DIAS_NO_MES[Number(mes) - 1]! : 31;

  async function enviar() {
    setErro(null);
    if (cidade.trim().length < 2 || bairro.trim().length < 2) {
      setErro("Preenche a cidade e o bairro, por favor.");
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch(`/api/v1/perfil/public/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cidade: cidade.trim(),
          bairro: bairro.trim(),
          dia: dia ? Number(dia) : null,
          mes: mes ? Number(mes) : null,
        }),
      });
      if (!r.ok) throw new Error("falha");
      setPronto(true);
    } catch {
      setErro("Não consegui salvar agora. Tenta de novo em instantes.");
    } finally {
      setEnviando(false);
    }
  }

  if (pronto) {
    return (
      <div
        style={{
          background: "#13233a",
          border: "1px solid rgba(215,243,106,0.4)",
          borderRadius: 18,
          padding: "36px 24px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 44, marginBottom: 10 }}>✅</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>Prontinho{primeiroNome ? `, ${primeiroNome}` : ""}!</h1>
        <p style={{ color: "#a7b6c9", fontSize: 15, margin: 0 }}>
          Recebemos seus dados. Pode fechar esta página — a gente continua pela conversa no WhatsApp. 💚
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#13233a",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 18,
        padding: "28px 24px",
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px" }}>
        {primeiroNome ? `Oi, ${primeiroNome}!` : "Oi!"}
      </h1>
      <p style={{ color: "#a7b6c9", fontSize: 14, margin: "0 0 22px" }}>
        Pra gente te mandar conteúdo da sua região e lembrar do seu aniversário, confirma só isso aqui:
      </p>

      <div style={{ marginBottom: 16 }}>
        <label style={rotulo} htmlFor="cidade">Cidade</label>
        <input id="cidade" style={campo} value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Ex.: Belo Horizonte" />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={rotulo} htmlFor="bairro">Bairro</label>
        <input id="bairro" style={campo} value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Ex.: Centro" />
      </div>

      <div style={{ marginBottom: 22 }}>
        <label style={rotulo}>Aniversário <span style={{ textTransform: "none", fontWeight: 400, color: "#6d7f98" }}>(dia e mês — sem o ano)</span></label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 10 }}>
          <select
            style={campo}
            value={dia}
            onChange={(e) => setDia(e.target.value)}
            aria-label="Dia do aniversário"
          >
            <option value="">Dia</option>
            {Array.from({ length: maxDia }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select
            style={campo}
            value={mes}
            onChange={(e) => {
              const novoMes = e.target.value;
              setMes(novoMes);
              // Se o dia escolhido não cabe no novo mês (ex.: 31 → fevereiro), limpa.
              if (novoMes && dia && Number(dia) > DIAS_NO_MES[Number(novoMes) - 1]!) setDia("");
            }}
            aria-label="Mês do aniversário"
          >
            <option value="">Mês</option>
            {MESES.map((nome, i) => (
              <option key={nome} value={i + 1}>{nome}</option>
            ))}
          </select>
        </div>
      </div>

      {erro && <p style={{ color: "#ff9b8d", fontSize: 14, margin: "0 0 14px" }}>{erro}</p>}

      <button
        type="button"
        onClick={() => void enviar()}
        disabled={enviando}
        style={{
          width: "100%",
          borderRadius: 999,
          border: "none",
          background: "#D7F36A",
          color: "#16181D",
          fontWeight: 800,
          fontSize: 16,
          padding: "14px",
          cursor: enviando ? "default" : "pointer",
          opacity: enviando ? 0.7 : 1,
        }}
      >
        {enviando ? "Salvando…" : "Salvar"}
      </button>
      <p style={{ color: "#6d7f98", fontSize: 12, textAlign: "center", margin: "14px 0 0" }}>
        Seus dados são usados só pra te mandar conteúdo e felicitar no aniversário.
      </p>
    </div>
  );
}
