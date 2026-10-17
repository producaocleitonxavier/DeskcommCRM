"use client";

/**
 * Detalhe/edição de uma demanda (Gabinete). Edita campos, aplica transições de
 * estado (mantendo a coerência desfecho⇔fechada_em exigida pelo banco) e o
 * texto de encaminhamento. Grava via Supabase browser client (RLS).
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Sparkles, X } from "lucide-react";

import { gerarEncaminhamento } from "@/app/actions/politico/gerarEncaminhamento";
import { atualizarRegistro } from "@/app/actions/politico/gabinete-actions";
import DemandaAnexos from "@/components/politico/demanda-anexos";

interface Opcao {
  id: string;
  nome: string;
}

export interface DemandaDetalhe {
  id: string;
  assunto: string | null;
  estado: string;
  origem: string | null;
  pol_tipo: string | null;
  pol_prioridade: string | null;
  pol_orgao_destino: string | null;
  pol_encaminhamento_ia: string | null;
  pol_territory_id: string | null;
  pol_lideranca_id: string | null;
  dono_kind: string | null;
  aberta_em: string;
  prazo_em: string | null;
  desfecho: string | null;
  fechada_em: string | null;
  created_at: string;
  updated_at: string;
  contacts: { name: string | null; phone_number: string | null } | null;
}

export interface Props {
  demanda: DemandaDetalhe;
  territorios: Opcao[];
  liderancas: Opcao[];
}

const TIPOS: Opcao[] = [
  { id: "servico_publico", nome: "Serviço público" },
  { id: "infraestrutura", nome: "Infraestrutura" },
  { id: "saude", nome: "Saúde" },
  { id: "educacao", nome: "Educação" },
  { id: "seguranca", nome: "Segurança" },
  { id: "assistencia_social", nome: "Assistência social" },
  { id: "meio_ambiente", nome: "Meio ambiente" },
  { id: "documentacao", nome: "Documentação" },
  { id: "emprego", nome: "Emprego" },
  { id: "outro", nome: "Outro" },
];
const PRIORIDADES: Opcao[] = [
  { id: "baixa", nome: "Baixa" },
  { id: "normal", nome: "Normal" },
  { id: "alta", nome: "Alta" },
  { id: "urgente", nome: "Urgente" },
];
const ESTADO_LABEL: Record<string, string> = {
  aberta: "Nova",
  em_atendimento: "Em atendimento",
  aguardando_cliente: "Aguardando cidadão",
  resolvida: "Resolvida",
  encerrada: "Encerrada",
};
const ESTADO_COR: Record<string, { bg: string; color: string }> = {
  aberta: { bg: "rgba(245,158,11,0.15)", color: "#F59E0B" },
  em_atendimento: { bg: "rgba(59,130,246,0.15)", color: "#60A5FA" },
  aguardando_cliente: { bg: "rgba(252,211,77,0.15)", color: "#FCD34D" },
  resolvida: { bg: "rgba(34,197,94,0.15)", color: "#22C55E" },
  encerrada: { bg: "rgba(156,163,175,0.15)", color: "#9CA3AF" },
};

function nomeDe(lista: Opcao[], id: string | null): string {
  if (!id) return "—";
  return lista.find((o) => o.id === id)?.nome ?? "—";
}
function labelTipo(id: string | null): string {
  if (!id) return "—";
  return TIPOS.find((t) => t.id === id)?.nome ?? id;
}
function fmtData(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
function paraInputDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export default function DetalheDemandaClient({ demanda, territorios, liderancas }: Props) {
  const router = useRouter();

  const [d, setD] = useState<DemandaDetalhe>(demanda);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [gerandoIA, setGerandoIA] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Campos editáveis (rascunho)
  const [assunto, setAssunto] = useState(d.assunto ?? "");
  const [tipo, setTipo] = useState(d.pol_tipo ?? "");
  const [prioridade, setPrioridade] = useState(d.pol_prioridade ?? "normal");
  const [orgao, setOrgao] = useState(d.pol_orgao_destino ?? "");
  const [prazo, setPrazo] = useState(paraInputDate(d.prazo_em));
  const [territoryId, setTerritoryId] = useState(d.pol_territory_id ?? "");
  const [liderancaId, setLiderancaId] = useState(d.pol_lideranca_id ?? "");
  const [encaminhamento, setEncaminhamento] = useState(d.pol_encaminhamento_ia ?? "");

  const fechada = d.estado === "resolvida" || d.estado === "encerrada";

  async function persistir(patch: Record<string, unknown>, otimista: Partial<DemandaDetalhe>) {
    setErro(null);
    setSalvando(true);
    const res = await atualizarRegistro("demandas", d.id, patch);
    setSalvando(false);
    if (!res.ok) {
      setErro(res.erro);
      return false;
    }
    setD((prev) => ({ ...prev, ...otimista }));
    router.refresh();
    return true;
  }

  async function salvarEdicao() {
    const patch: Record<string, unknown> = {
      assunto: assunto.trim() || null,
      pol_tipo: tipo || null,
      pol_prioridade: prioridade,
      pol_orgao_destino: orgao.trim() || null,
      pol_territory_id: territoryId || null,
      pol_lideranca_id: liderancaId || null,
      pol_encaminhamento_ia: encaminhamento.trim() || null,
      prazo_em: prazo ? new Date(prazo + "T12:00:00").toISOString() : null,
    };
    const ok = await persistir(patch, {
      assunto: assunto.trim() || null,
      pol_tipo: tipo || null,
      pol_prioridade: prioridade,
      pol_orgao_destino: orgao.trim() || null,
      pol_territory_id: territoryId || null,
      pol_lideranca_id: liderancaId || null,
      pol_encaminhamento_ia: encaminhamento.trim() || null,
      prazo_em: prazo ? new Date(prazo + "T12:00:00").toISOString() : null,
    });
    if (ok) setEditando(false);
  }

  async function mudarEstado(novo: string) {
    const nowISO = new Date().toISOString();
    let patch: Record<string, unknown>;
    let otim: Partial<DemandaDetalhe>;
    if (novo === "resolvida") {
      patch = { estado: "resolvida", desfecho: "resolvida", fechada_em: nowISO };
      otim = { estado: "resolvida", desfecho: "resolvida", fechada_em: nowISO };
    } else if (novo === "encerrada") {
      patch = { estado: "encerrada", desfecho: "nao_procede", fechada_em: nowISO };
      otim = { estado: "encerrada", desfecho: "nao_procede", fechada_em: nowISO };
    } else {
      patch = { estado: novo, desfecho: null, fechada_em: null };
      otim = { estado: novo, desfecho: null, fechada_em: null };
    }
    await persistir(patch, otim);
  }

  // Ações de estado disponíveis conforme o estado atual.
  const acoes: { label: string; estado: string; tom?: "dark" | "ok" | "mut" }[] = (() => {
    switch (d.estado) {
      case "aberta":
        return [{ label: "Iniciar atendimento", estado: "em_atendimento", tom: "dark" }];
      case "em_atendimento":
        return [
          { label: "Aguardar cidadão", estado: "aguardando_cliente", tom: "mut" },
          { label: "Marcar resolvida", estado: "resolvida", tom: "ok" },
          { label: "Encerrar", estado: "encerrada", tom: "mut" },
        ];
      case "aguardando_cliente":
        return [
          { label: "Retomar atendimento", estado: "em_atendimento", tom: "dark" },
          { label: "Marcar resolvida", estado: "resolvida", tom: "ok" },
          { label: "Encerrar", estado: "encerrada", tom: "mut" },
        ];
      default:
        return [{ label: "Reabrir", estado: "aberta", tom: "mut" }];
    }
  })();

  const ec = ESTADO_COR[d.estado] ?? ESTADO_COR.aberta!;

  return (
    <div className="mx-auto max-w-[860px] px-4 py-7 space-y-5" style={{ background: "var(--color-bg)" }}>
      <div>
        <Link href="/app/politico/demandas" className="inline-flex items-center gap-1 text-sm transition-colors" style={{ color: "var(--color-text-muted)" }}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Demandas
        </Link>
      </div>

      {/* Cabeçalho */}
      <header className="wr-card p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: ec.bg, color: ec.color }}>
              {ESTADO_LABEL[d.estado] ?? d.estado}
            </span>
            <h1 className="mt-2 font-heading text-2xl font-bold leading-tight" style={{ color: "var(--color-text)" }}>
              {d.assunto || "Sem assunto"}
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
              {d.contacts?.name ?? "Cidadão sem nome"}
              {d.contacts?.phone_number ? ` · ${d.contacts.phone_number}` : ""}
            </p>
          </div>
          {!editando && (
            <button type="button" onClick={() => setEditando(true)} className="wr-btn inline-flex items-center gap-2">
              <Pencil className="h-4 w-4" aria-hidden /> Editar
            </button>
          )}
        </div>

        {/* Transições de estado */}
        <div className="mt-4 flex flex-wrap gap-2">
          {acoes.map((a) => (
            <button
              key={a.estado + a.label}
              type="button"
              disabled={salvando}
              onClick={() => mudarEstado(a.estado)}
              className={a.tom === "dark" ? "wr-btn-dark" : "wr-btn"}
              style={a.tom === "ok" ? { background: "#17784F", color: "#FFFFFF", borderColor: "#17784F" } : undefined}
            >
              {a.label}
            </button>
          ))}
        </div>
      </header>

      {erro && (
        <div role="alert" className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FBE4E2", color: "#A3302A" }}>
          {erro}
        </div>
      )}

      {/* Campos */}
      <section className="wr-card p-6 sm:p-7">
        {editando ? (
          <div className="space-y-4">
            <Campo label="Assunto">
              <textarea value={assunto} onChange={(e) => setAssunto(e.target.value)} rows={3} className="wr-input w-full" />
            </Campo>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo label="Tipo">
                <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="wr-input w-full">
                  <option value="">—</option>
                  {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </Campo>
              <Campo label="Prioridade">
                <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)} className="wr-input w-full">
                  {PRIORIDADES.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </Campo>
              <Campo label="Órgão de destino">
                <input type="text" value={orgao} onChange={(e) => setOrgao(e.target.value)} className="wr-input w-full" />
              </Campo>
              <Campo label="Prazo">
                <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className="wr-input w-full" />
              </Campo>
              {territorios.length > 0 && (
                <Campo label="Território">
                  <select value={territoryId} onChange={(e) => setTerritoryId(e.target.value)} className="wr-input w-full">
                    <option value="">—</option>
                    {territorios.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                  </select>
                </Campo>
              )}
              {liderancas.length > 0 && (
                <Campo label="Liderança responsável">
                  <select value={liderancaId} onChange={(e) => setLiderancaId(e.target.value)} className="wr-input w-full">
                    <option value="">—</option>
                    {liderancas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                  </select>
                </Campo>
              )}
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button type="button" disabled={salvando} onClick={salvarEdicao} className="wr-btn-dark disabled:opacity-60">
                {salvando ? "Salvando…" : "Salvar alterações"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditando(false);
                  setAssunto(d.assunto ?? "");
                  setTipo(d.pol_tipo ?? "");
                  setPrioridade(d.pol_prioridade ?? "normal");
                  setOrgao(d.pol_orgao_destino ?? "");
                  setPrazo(paraInputDate(d.prazo_em));
                  setTerritoryId(d.pol_territory_id ?? "");
                  setLiderancaId(d.pol_lideranca_id ?? "");
                }}
                className="wr-btn inline-flex items-center gap-1.5"
              >
                <X className="h-4 w-4" aria-hidden /> Cancelar
              </button>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <Info label="Tipo" valor={labelTipo(d.pol_tipo)} />
            <Info label="Prioridade" valor={PRIORIDADES.find((p) => p.id === d.pol_prioridade)?.nome ?? "Normal"} />
            <Info label="Órgão de destino" valor={d.pol_orgao_destino ?? "—"} />
            <Info label="Prazo" valor={fmtData(d.prazo_em)} />
            <Info label="Território" valor={nomeDe(territorios, d.pol_territory_id)} />
            <Info label="Liderança" valor={nomeDe(liderancas, d.pol_lideranca_id)} />
            <Info label="Aberta em" valor={fmtData(d.aberta_em)} />
            <Info label="Responsável" valor={d.dono_kind === "humano" ? "Assessor" : "IA / triagem"} />
          </dl>
        )}
      </section>

      {/* Encaminhamento (+ IA no próximo passo) */}
      <section className="wr-card p-6 sm:p-7">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>Encaminhamento ao órgão</h2>
          <button
            type="button"
            disabled={gerandoIA}
            onClick={async () => {
              setErro(null);
              setGerandoIA(true);
              const res = await gerarEncaminhamento(d.id);
              setGerandoIA(false);
              if (res.ok) {
                setEncaminhamento(res.texto);
                setEditando(true);
              } else {
                setErro(res.erro);
              }
            }}
            className="wr-btn inline-flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: "rgba(215,243,106,0.14)", color: "#D7F36A", borderColor: "rgba(215,243,106,0.3)" }}
          >
            <Sparkles className="h-4 w-4" aria-hidden /> {gerandoIA ? "Gerando…" : "Gerar com IA"}
          </button>
        </div>
        {editando ? (
          <textarea
            value={encaminhamento}
            onChange={(e) => setEncaminhamento(e.target.value)}
            rows={12}
            placeholder="Ex.: Ofício encaminhado à Secretaria de Obras solicitando…"
            className="w-full resize-y rounded-xl px-4 py-3.5 text-sm leading-relaxed outline-none transition-colors focus:border-[rgba(215,243,106,0.55)]"
            style={{
              background: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
              minHeight: 260,
              boxShadow: "none",
            }}
          />
        ) : d.pol_encaminhamento_ia ? (
          <div
            className="rounded-xl p-5 text-sm leading-relaxed whitespace-pre-wrap"
            style={{
              background: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
            }}
          >
            {d.pol_encaminhamento_ia}
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>
            Sem encaminhamento registrado. Edite para redigir — em breve, a IA redige para você.
          </p>
        )}
      </section>

      {/* Anexos (ofícios, fotos, documentos) */}
      <DemandaAnexos demandaId={d.id} />
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
