"use client";

/**
 * Gestão de adversários: cadastro dos oponentes + feed de sinais (menções da
 * imprensa que citam cada adversário, geradas pelo motor a partir da escuta).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Swords, X, ExternalLink } from "lucide-react";

import { registrarAdversario, removerAdversario, gerarSinaisAdversariosAcao, type SinalAdversario } from "@/app/actions/politico/adversarios";

interface AdvLite { id: string; name: string; username: string | null; threatScore: number; riskLevel: string }

const RISCO = {
  low: { label: "Baixo", cor: "#22C55E" },
  medium: { label: "Médio", cor: "#F59E0B" },
  high: { label: "Alto", cor: "#FB923C" },
  critical: { label: "Crítico", cor: "#EF4444" },
} as const;

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function AdversariosGestao({ adversarios, sinais }: { adversarios: AdvLite[]; sinais: SinalAdversario[] }) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [handle, setHandle] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [addPend, startAdd] = useTransition();
  const [sinPend, startSin] = useTransition();

  function adicionar() {
    if (!nome.trim()) return;
    setMsg(null);
    startAdd(async () => {
      const r = await registrarAdversario(nome, handle);
      if (!r.ok) { setMsg(r.erro ?? "Falha."); return; }
      setNome(""); setHandle("");
      router.refresh();
    });
  }
  function remover(id: string) {
    startAdd(async () => { await removerAdversario(id); router.refresh(); });
  }
  function varrer() {
    setMsg(null);
    startSin(async () => {
      const r = await gerarSinaisAdversariosAcao();
      setMsg(r.ok ? `${r.n} novos sinais de adversário.` : r.erro ?? "Falha.");
      if (r.ok) router.refresh();
    });
  }
  return (
    <div className="mx-auto max-w-[1040px] px-4 space-y-4">
      {/* Cadastro */}
      <section className="wr-card p-5">
        <div className="mb-3 flex items-center gap-1.5 text-sm font-bold" style={{ color: "var(--color-text)" }}>
          <Swords className="h-4 w-4" style={{ color: "#F87171" }} aria-hidden /> Meus adversários
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <input value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === "Enter" && adicionar()} placeholder="Nome do adversário (ex.: Fulano de Tal)" className="wr-input min-w-[200px] flex-1" />
          <input value={handle} onChange={(e) => setHandle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && adicionar()} placeholder="@instagram (opcional)" className="wr-input min-w-[150px]" style={{ flex: "0 1 180px" }} />
          <button type="button" onClick={adicionar} disabled={addPend || !nome.trim()} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: "#D7F36A", color: "#16181D" }}>
            <UserPlus className="h-4 w-4" aria-hidden /> Adicionar
          </button>
          <button type="button" onClick={varrer} disabled={sinPend || adversarios.length === 0} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
            {sinPend ? "Varrendo…" : "Varrer menções"}
          </button>
        </div>
        {msg && <p className="mt-2 text-xs" style={{ color: "var(--color-text-subtle)" }}>{msg}</p>}
        {adversarios.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {adversarios.map((a) => {
              const r = RISCO[a.riskLevel as keyof typeof RISCO] ?? RISCO.low;
              return (
                <span key={a.id} className="inline-flex items-center gap-2 rounded-full py-1 pl-3 pr-1.5 text-sm" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--color-border)" }}>
                  <span style={{ color: "var(--color-text)" }}>{a.name}</span>
                  {a.username && <span style={{ color: "#60A5FA" }}>@{a.username}</span>}
                  <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: `${r.cor}22`, color: r.cor }}>{r.label} · {a.threatScore}</span>
                  <button type="button" onClick={() => remover(a.id)} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-[rgba(255,255,255,0.08)]" aria-label={`Remover ${a.name}`} style={{ color: "var(--color-text-subtle)" }}><X className="h-3 w-3" /></button>
                </span>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-xs" style={{ color: "var(--color-text-subtle)" }}>Cadastre os adversários e o motor detecta as menções a eles na imprensa (a partir da Opinião Pública). A pontuação de ameaça sobe conforme a presença na mídia.</p>
      </section>

      {/* Sinais */}
      {sinais.length > 0 && (
        <section className="wr-card p-5">
          <div className="mb-3 text-sm font-bold" style={{ color: "var(--color-text)" }}>Sinais recentes (menções a adversários)</div>
          <ul className="flex flex-col gap-2">
            {sinais.map((s) => {
              const r = RISCO[s.severity as keyof typeof RISCO] ?? RISCO.medium;
              return (
                <li key={s.id} className="flex items-start gap-3 rounded-lg p-2.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--color-border)" }}>
                  <span className="mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${r.cor}22`, color: r.cor }}>{s.adversario}</span>
                  <div className="min-w-0 flex-1">
                    <a href={s.url ?? "#"} target="_blank" rel="noopener noreferrer" className="flex items-start gap-1 text-sm hover:opacity-70" style={{ color: "var(--color-text)" }}>
                      <span className="min-w-0">{s.descricao}</span>
                      {s.url && <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" aria-hidden style={{ color: "var(--color-text-subtle)" }} />}
                    </a>
                    <div className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-subtle)" }}>{fmt(s.createdAt)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
