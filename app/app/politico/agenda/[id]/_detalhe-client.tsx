"use client";

/**
 * Detalhe/edição de um compromisso da agenda (Gabinete). Ver, editar e mudar
 * status (agendado → confirmado → concluído / cancelado). Grava via Supabase.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, X } from "lucide-react";

import { createClient } from "@/lib/supabase/browser";

interface Opcao {
  id: string;
  nome: string;
}

export interface CompromissoDetalhe {
  id: string;
  titulo: string;
  descricao: string | null;
  tipo: string;
  data_inicio: string;
  data_fim: string | null;
  dia_inteiro: boolean;
  status: string;
  local: string | null;
  municipio: string | null;
  territory_id: string | null;
  lideranca_id: string | null;
}

export interface Props {
  compromisso: CompromissoDetalhe;
  territorios: Opcao[];
  liderancas: Opcao[];
}

const TIPOS: Opcao[] = [
  { id: "reuniao", nome: "Reunião" },
  { id: "visita", nome: "Visita" },
  { id: "audiencia", nome: "Audiência" },
  { id: "evento", nome: "Evento" },
  { id: "ligacao", nome: "Ligação" },
  { id: "compromisso", nome: "Compromisso" },
  { id: "outro", nome: "Outro" },
];
const STATUS_OPC: Opcao[] = [
  { id: "agendado", nome: "Agendado" },
  { id: "confirmado", nome: "Confirmado" },
  { id: "concluido", nome: "Concluído" },
  { id: "cancelado", nome: "Cancelado" },
];
const STATUS_COR: Record<string, { bg: string; color: string }> = {
  agendado: { bg: "rgba(245,158,11,0.16)", color: "#F59E0B" },
  confirmado: { bg: "rgba(34,197,94,0.16)", color: "#22C55E" },
  concluido: { bg: "rgba(156,163,175,0.16)", color: "#9CA3AF" },
  cancelado: { bg: "rgba(239,68,68,0.16)", color: "#EF4444" },
};

function rotulo(lista: Opcao[], id: string | null): string {
  if (!id) return "—";
  return lista.find((o) => o.id === id)?.nome ?? id;
}
function paraInputDT(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function quando(c: CompromissoDetalhe): string {
  const ini = new Date(c.data_inicio);
  const dia = ini.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  if (c.dia_inteiro) return `${dia} · dia inteiro`;
  const h = ini.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const hf = c.data_fim ? ` – ${new Date(c.data_fim).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "";
  return `${dia} · ${h}${hf}`;
}

export default function DetalheCompromissoClient({ compromisso, territorios, liderancas }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [c, setC] = useState<CompromissoDetalhe>(compromisso);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [titulo, setTitulo] = useState(c.titulo);
  const [tipo, setTipo] = useState(c.tipo);
  const [inicio, setInicio] = useState(paraInputDT(c.data_inicio));
  const [fim, setFim] = useState(paraInputDT(c.data_fim));
  const [diaInteiro, setDiaInteiro] = useState(c.dia_inteiro);
  const [local, setLocal] = useState(c.local ?? "");
  const [municipio, setMunicipio] = useState(c.municipio ?? "");
  const [territoryId, setTerritoryId] = useState(c.territory_id ?? "");
  const [liderancaId, setLiderancaId] = useState(c.lideranca_id ?? "");
  const [descricao, setDescricao] = useState(c.descricao ?? "");

  async function persistir(patch: Record<string, unknown>, otim: Partial<CompromissoDetalhe>) {
    setErro(null);
    setSalvando(true);
    const { error } = await supabase.from("pol_agenda").update(patch).eq("id", c.id);
    setSalvando(false);
    if (error) {
      setErro(`Não foi possível salvar: ${error.message}`);
      return false;
    }
    setC((prev) => ({ ...prev, ...otim }));
    router.refresh();
    return true;
  }

  async function salvarEdicao() {
    if (!titulo.trim()) return setErro("Informe o título.");
    if (!inicio) return setErro("Informe o início.");
    const patch: Record<string, unknown> = {
      titulo: titulo.trim(),
      tipo,
      data_inicio: new Date(inicio).toISOString(),
      data_fim: fim ? new Date(fim).toISOString() : null,
      dia_inteiro: diaInteiro,
      local: local.trim() || null,
      municipio: municipio.trim() || null,
      territory_id: territoryId || null,
      lideranca_id: liderancaId || null,
      descricao: descricao.trim() || null,
    };
    const ok = await persistir(patch, patch as unknown as Partial<CompromissoDetalhe>);
    if (ok) setEditando(false);
  }

  const sc = STATUS_COR[c.status] ?? STATUS_COR.agendado!;
  const acoes =
    c.status === "agendado"
      ? [{ label: "Confirmar", novo: "confirmado", ok: true }, { label: "Cancelar", novo: "cancelado" }]
      : c.status === "confirmado"
        ? [{ label: "Marcar concluído", novo: "concluido", ok: true }, { label: "Cancelar", novo: "cancelado" }]
        : [{ label: "Reabrir", novo: "agendado" }];

  return (
    <div className="mx-auto max-w-[820px] px-4 py-7 space-y-5" style={{ background: "var(--color-bg)" }}>
      <div>
        <Link href="/app/politico/agenda" className="inline-flex items-center gap-1 text-sm transition-colors" style={{ color: "var(--color-text-muted)" }}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Agenda
        </Link>
      </div>

      <header className="wr-card p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: sc.bg, color: sc.color }}>
              {rotulo(STATUS_OPC, c.status)}
            </span>
            <h1 className="mt-2 font-heading text-2xl font-bold leading-tight" style={{ color: "var(--color-text)" }}>{c.titulo}</h1>
            <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>{quando(c)}</p>
            {[c.local, c.municipio].filter(Boolean).length > 0 && (
              <p className="mt-0.5 text-sm" style={{ color: "var(--color-text-muted)" }}>{[c.local, c.municipio].filter(Boolean).join(" · ")}</p>
            )}
          </div>
          {!editando && (
            <button type="button" onClick={() => setEditando(true)} className="wr-btn inline-flex items-center gap-2"><Pencil className="h-4 w-4" aria-hidden /> Editar</button>
          )}
        </div>
        {!editando && (
          <div className="mt-4 flex flex-wrap gap-2">
            {acoes.map((a) => (
              <button
                key={a.novo}
                type="button"
                disabled={salvando}
                onClick={() => persistir({ status: a.novo }, { status: a.novo })}
                className={a.ok ? "wr-btn-dark" : "wr-btn"}
                style={a.ok ? { background: "#17784F", color: "#FFFFFF", borderColor: "#17784F" } : undefined}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </header>

      {erro && <div role="alert" className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FBE4E2", color: "#A3302A" }}>{erro}</div>}

      <section className="wr-card p-6 sm:p-7">
        {editando ? (
          <div className="space-y-4">
            <Campo label="Título"><input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} className="wr-input w-full" /></Campo>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo label="Tipo"><select value={tipo} onChange={(e) => setTipo(e.target.value)} className="wr-input w-full">{TIPOS.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></Campo>
              <Campo label="Início"><input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} className="wr-input w-full" /></Campo>
              <Campo label="Fim"><input type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} className="wr-input w-full" /></Campo>
              <Campo label="Local"><input type="text" value={local} onChange={(e) => setLocal(e.target.value)} className="wr-input w-full" /></Campo>
              <Campo label="Município"><input type="text" value={municipio} onChange={(e) => setMunicipio(e.target.value)} className="wr-input w-full" /></Campo>
              {territorios.length > 0 && <Campo label="Território"><select value={territoryId} onChange={(e) => setTerritoryId(e.target.value)} className="wr-input w-full"><option value="">—</option>{territorios.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></Campo>}
              {liderancas.length > 0 && <Campo label="Liderança"><select value={liderancaId} onChange={(e) => setLiderancaId(e.target.value)} className="wr-input w-full"><option value="">—</option>{liderancas.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></Campo>}
            </div>
            <label className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--color-text)" }}>
              <input type="checkbox" checked={diaInteiro} onChange={(e) => setDiaInteiro(e.target.checked)} /> Dia inteiro
            </label>
            <Campo label="Descrição"><textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} className="wr-input w-full" /></Campo>
            <div className="flex items-center gap-3 pt-1">
              <button type="button" disabled={salvando} onClick={salvarEdicao} className="wr-btn-dark disabled:opacity-60">{salvando ? "Salvando…" : "Salvar alterações"}</button>
              <button type="button" onClick={() => setEditando(false)} className="wr-btn inline-flex items-center gap-1.5"><X className="h-4 w-4" aria-hidden /> Cancelar</button>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <Info label="Tipo" valor={rotulo(TIPOS, c.tipo)} />
            <Info label="Território" valor={rotulo(territorios, c.territory_id)} />
            <Info label="Liderança" valor={rotulo(liderancas, c.lideranca_id)} />
            <Info label="Local" valor={c.local ?? "—"} />
            {c.descricao && <div className="sm:col-span-2"><Info label="Descrição" valor={c.descricao} /></div>}
          </dl>
        )}
      </section>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--color-text)" }}>{label}</label>
      {children}
    </div>
  );
}
function Info({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs font-medium" style={{ color: "var(--color-text-subtle)" }}>{label}</dt>
      <dd className="mt-0.5 text-sm font-medium" style={{ color: "var(--color-text)" }}>{valor}</dd>
    </div>
  );
}
