"use client";

/**
 * Formulário público de captação (cadastro) vinculado a uma liderança.
 * Posta em /api/public/captacao/[lideranca]. Inclui honeypot (campo oculto).
 */

import { useState } from "react";

interface Props {
  liderancaId: string;
  liderancaNome: string;
  gabineteNome: string;
  logoUrl: string | null;
}

export default function CaptacaoClient({ liderancaId, liderancaNome, gabineteNome, logoUrl }: Props) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cidade, setCidade] = useState("");
  const [bairro, setBairro] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!nome.trim() || telefone.replace(/\D/g, "").length < 10) {
      setErro("Preencha seu nome e um telefone válido com DDD.");
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch(`/api/public/captacao/${liderancaId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), telefone: telefone.trim(), cidade: cidade.trim() || undefined, bairro: bairro.trim() || undefined, website }),
      });
      if (!res.ok) {
        let msg = "Não foi possível enviar. Tente novamente.";
        try {
          const j = (await res.json()) as { error?: { message?: string } };
          if (j?.error?.message) msg = j.error.message;
        } catch {
          /* corpo não-JSON */
        }
        setErro(msg);
      } else {
        setOk(true);
      }
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{ background: "linear-gradient(160deg,#0E1116 0%,#14181F 55%,#1A2410 100%)" }}
    >
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={gabineteNome} className="mb-3 h-16 w-auto object-contain" />
          ) : null}
          <div className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "#D7F36A" }}>
            {gabineteNome}
          </div>
        </div>

        <div className="rounded-2xl p-6 sm:p-7" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
          {ok ? (
            <div className="py-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "rgba(34,197,94,0.18)", color: "#22C55E" }}>✓</div>
              <h1 className="font-heading text-xl font-bold" style={{ color: "#FFFFFF" }}>Cadastro recebido!</h1>
              <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
                Obrigado. Em breve entraremos em contato. Você pode fechar esta página.
              </p>
            </div>
          ) : (
            <form onSubmit={enviar} className="space-y-4">
              <div>
                <h1 className="font-heading text-xl font-bold" style={{ color: "#FFFFFF" }}>Faça seu cadastro</h1>
                <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
                  Indicação de <strong style={{ color: "rgba(255,255,255,0.85)" }}>{liderancaNome}</strong>.
                </p>
              </div>

              {erro && (
                <div role="alert" className="rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(239,68,68,0.15)", color: "#FCA5A5" }}>
                  {erro}
                </div>
              )}

              <Campo label="Nome completo *">
                <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} required className="campo" placeholder="Seu nome" />
              </Campo>
              <Campo label="WhatsApp *">
                <input type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} required className="campo" placeholder="(31) 99999-9999" />
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Cidade">
                  <input type="text" value={cidade} onChange={(e) => setCidade(e.target.value)} className="campo" placeholder="Cidade" />
                </Campo>
                <Campo label="Bairro">
                  <input type="text" value={bairro} onChange={(e) => setBairro(e.target.value)} className="campo" placeholder="Bairro" />
                </Campo>
              </div>

              {/* honeypot — oculto para humanos, bots preenchem */}
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
                aria-hidden
              />

              <button
                type="submit"
                disabled={enviando}
                className="w-full rounded-full py-3 text-sm font-semibold disabled:opacity-60"
                style={{ background: "#D7F36A", color: "#14181F" }}
              >
                {enviando ? "Enviando…" : "Quero participar"}
              </button>
              <p className="text-center text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                Ao enviar, você concorda em ser contatado(a) pelo gabinete.
              </p>
            </form>
          )}
        </div>
      </div>

      <style>{`
        .campo {
          width: 100%;
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 14px;
          color: #fff;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.14);
          outline: none;
        }
        .campo:focus { border-color: rgba(215,243,106,0.55); }
        .campo::placeholder { color: rgba(255,255,255,0.35); }
      `}</style>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>{label}</span>
      {children}
    </label>
  );
}
