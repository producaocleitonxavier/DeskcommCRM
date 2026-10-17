"use client";

/**
 * Detalhe/edição + timeline de tramitação de um projeto de lei (Gabinete).
 * Mostra o caminho rascunho → apresentado → em tramitação → comissão →
 * plenário → aprovado → promulgado, permite "registrar movimentação" (avança e
 * carimba a data) e editar todos os campos. Grava via Supabase (RLS).
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Pencil, X } from "lucide-react";

import { atualizarRegistro } from "@/app/actions/politico/gabinete-actions";

interface Opcao {
  id: string;
  nome: string;
}

export interface ProjetoDetalhe {
  id: string;
  numero: string;
  tipo: string;
  esfera: string;
  titulo: string;
  ementa: string | null;
  descricao: string | null;
  tema: string | null;
  url_oficial: string | null;
  autor_mandatario: boolean;
  coautores: string[] | null;
  data_apresentacao: string | null;
  data_ultima_movimentacao: string | null;
  status: string;
  comissao_atual: string | null;
  relator: string | null;
  prioridade: string;
  alinhamento_campanha: boolean;
  temas_campanha: string[] | null;
  alertas_ativos: boolean;
}

const TIPOS: Opcao[] = [
  { id: "projeto_de_lei", nome: "Projeto de lei" },
  { id: "projeto_de_resolucao", nome: "Projeto de resolução" },
  { id: "projeto_de_emenda", nome: "Projeto de emenda" },
  { id: "indicacao", nome: "Indicação" },
  { id: "mocao", nome: "Moção" },
  { id: "requerimento", nome: "Requerimento" },
  { id: "pedido_de_informacao", nome: "Pedido de informação" },
  { id: "projeto_de_decreto", nome: "Projeto de decreto" },
  { id: "outro", nome: "Outro" },
];
const ESFERAS: Opcao[] = [
  { id: "municipal", nome: "Municipal" },
  { id: "estadual", nome: "Estadual" },
  { id: "federal", nome: "Federal" },
];
const PRIORIDADES: Opcao[] = [
  { id: "baixa", nome: "Baixa" },
  { id: "normal", nome: "Normal" },
  { id: "alta", nome: "Alta" },
  { id: "urgente", nome: "Urgente" },
];
const STATUS_OPC: Opcao[] = [
  { id: "rascunho", nome: "Rascunho" },
  { id: "apresentado", nome: "Apresentado" },
  { id: "em_tramitacao", nome: "Em tramitação" },
  { id: "em_comissao", nome: "Em comissão" },
  { id: "aprovado_comissao", nome: "Aprovado na comissão" },
  { id: "em_plenario", nome: "Em plenário" },
  { id: "aprovado", nome: "Aprovado" },
  { id: "vetado", nome: "Vetado" },
  { id: "promulgado", nome: "Promulgado" },
  { id: "arquivado", nome: "Arquivado" },
  { id: "retirado", nome: "Retirado" },
];
const FLOW = ["rascunho", "apresentado", "em_tramitacao", "em_comissao", "aprovado_comissao", "em_plenario", "aprovado", "promulgado"];
const FLOW_CURTO: Record<string, string> = {
  rascunho: "Rascunho",
  apresentado: "Apresentado",
  em_tramitacao: "Tramitação",
  em_comissao: "Comissão",
  aprovado_comissao: "Aprov. comissão",
  em_plenario: "Plenário",
  aprovado: "Aprovado",
  promulgado: "Promulgado",
};

function rotulo(lista: Opcao[], id: string | null): string {
  if (!id) return "—";
  return lista.find((o) => o.id === id)?.nome ?? id;
}
function fmtData(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function DetalheProjetoClient({ projeto }: { projeto: ProjetoDetalhe }) {
  const router = useRouter();

  const [p, setP] = useState<ProjetoDetalhe>(projeto);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [numero, setNumero] = useState(p.numero);
  const [tipo, setTipo] = useState(p.tipo);
  const [esfera, setEsfera] = useState(p.esfera);
  const [titulo, setTitulo] = useState(p.titulo);
  const [ementa, setEmenta] = useState(p.ementa ?? "");
  const [descricao, setDescricao] = useState(p.descricao ?? "");
  const [tema, setTema] = useState(p.tema ?? "");
  const [url, setUrl] = useState(p.url_oficial ?? "");
  const [autor, setAutor] = useState(p.autor_mandatario);
  const [coautores, setCoautores] = useState((p.coautores ?? []).join(", "));
  const [status, setStatus] = useState(p.status);
  const [comissao, setComissao] = useState(p.comissao_atual ?? "");
  const [relator, setRelator] = useState(p.relator ?? "");
  const [prioridade, setPrioridade] = useState(p.prioridade);
  const [alinhamento, setAlinhamento] = useState(p.alinhamento_campanha);
  const [temasCampanha, setTemasCampanha] = useState((p.temas_campanha ?? []).join(", "));

  async function persistir(patch: Record<string, unknown>, otim: Partial<ProjetoDetalhe>) {
    setErro(null);
    setSalvando(true);
    const res = await atualizarRegistro("pol_projetos_lei", p.id, patch);
    setSalvando(false);
    if (!res.ok) {
      setErro(res.erro);
      return false;
    }
    setP((prev) => ({ ...prev, ...otim }));
    router.refresh();
    return true;
  }

  async function registrarMovimentacao() {
    const i = FLOW.indexOf(p.status);
    if (i < 0 || i >= FLOW.length - 1) return;
    const novo = FLOW[i + 1]!;
    const hoje = new Date().toISOString().slice(0, 10);
    await persistir({ status: novo, data_ultima_movimentacao: hoje }, { status: novo, data_ultima_movimentacao: hoje });
  }

  async function salvarEdicao() {
    if (!numero.trim()) return setErro("Informe o número.");
    if (!titulo.trim()) return setErro("Informe o título.");
    const patch: Record<string, unknown> = {
      numero: numero.trim(),
      tipo,
      esfera,
      titulo: titulo.trim(),
      ementa: ementa.trim() || null,
      descricao: descricao.trim() || null,
      tema: tema.trim() || null,
      url_oficial: url.trim() || null,
      autor_mandatario: autor,
      coautores: coautores.split(",").map((s) => s.trim()).filter(Boolean),
      status,
      comissao_atual: comissao.trim() || null,
      relator: relator.trim() || null,
      prioridade,
      alinhamento_campanha: alinhamento,
      temas_campanha: temasCampanha.split(",").map((s) => s.trim()).filter(Boolean),
      data_ultima_movimentacao: new Date().toISOString().slice(0, 10),
    };
    const ok = await persistir(patch, patch as unknown as Partial<ProjetoDetalhe>);
    if (ok) setEditando(false);
  }

  const idx = FLOW.indexOf(p.status);
  const terminal = ["vetado", "arquivado", "retirado"].includes(p.status);
  const podeAvancar = idx >= 0 && idx < FLOW.length - 1;

  return (
    <div className="mx-auto max-w-[900px] px-4 py-7 space-y-5" style={{ background: "var(--color-bg)" }}>
      <div>
        <Link href="/app/politico/projetos-lei" className="inline-flex items-center gap-1 text-sm transition-colors" style={{ color: "var(--color-text-muted)" }}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Projetos de Lei
        </Link>
      </div>

      <header className="wr-card p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-subtle)" }}>
              {p.numero} · {rotulo(TIPOS, p.tipo)} · {rotulo(ESFERAS, p.esfera)}
            </div>
            <h1 className="mt-1 font-heading text-2xl font-bold leading-tight" style={{ color: "var(--color-text)" }}>{p.titulo}</h1>
            {p.ementa && <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>{p.ementa}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {p.autor_mandatario && <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "#E4E7F8", color: "#2F3DA8" }}>De autoria</span>}
              {p.alinhamento_campanha && <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "#E2F5EC", color: "#17784F" }}>Alinhado</span>}
              {p.comissao_atual && <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-subtle)" }}>{p.comissao_atual}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {p.url_oficial && (
              <a href={p.url_oficial} target="_blank" rel="noopener noreferrer" className="wr-btn inline-flex items-center gap-1.5">
                <ExternalLink className="h-4 w-4" aria-hidden /> Oficial
              </a>
            )}
            {podeAvancar && !terminal && !editando && (
              <button type="button" disabled={salvando} onClick={registrarMovimentacao} className="wr-btn-dark">Registrar movimentação</button>
            )}
            {!editando && (
              <button type="button" onClick={() => setEditando(true)} className="wr-btn inline-flex items-center gap-2"><Pencil className="h-4 w-4" aria-hidden /> Editar</button>
            )}
          </div>
        </div>

        {/* Timeline de tramitação */}
        {terminal ? (
          <div className="mt-4">
            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "#FBE4E2", color: "#A3302A" }}>
              {rotulo(STATUS_OPC, p.status)} · {fmtData(p.data_ultima_movimentacao)}
            </span>
          </div>
        ) : (
          <div className="mt-5 flex flex-wrap items-center gap-1.5">
            {FLOW.map((s, i) => {
              const reached = idx >= i;
              return (
                <div key={s} className="flex items-center gap-1.5">
                  <span
                    className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                    style={{
                      background: reached ? "rgba(215,243,106,0.14)" : "rgba(255,255,255,0.04)",
                      color: reached ? "#D7F36A" : "var(--color-text-subtle)",
                      border: `1px solid ${i === idx ? "rgba(215,243,106,0.5)" : "transparent"}`,
                    }}
                  >
                    {FLOW_CURTO[s]}
                  </span>
                  {i < FLOW.length - 1 && <span style={{ color: "var(--color-text-subtle)" }}>›</span>}
                </div>
              );
            })}
          </div>
        )}
      </header>

      {erro && <div role="alert" className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FBE4E2", color: "#A3302A" }}>{erro}</div>}

      <section className="wr-card p-6 sm:p-7">
        {editando ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo label="Número"><input type="text" value={numero} onChange={(e) => setNumero(e.target.value)} className="wr-input w-full" /></Campo>
              <Campo label="Status"><select value={status} onChange={(e) => setStatus(e.target.value)} className="wr-input w-full">{STATUS_OPC.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></Campo>
              <Campo label="Tipo"><select value={tipo} onChange={(e) => setTipo(e.target.value)} className="wr-input w-full">{TIPOS.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></Campo>
              <Campo label="Esfera"><select value={esfera} onChange={(e) => setEsfera(e.target.value)} className="wr-input w-full">{ESFERAS.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></Campo>
              <Campo label="Prioridade"><select value={prioridade} onChange={(e) => setPrioridade(e.target.value)} className="wr-input w-full">{PRIORIDADES.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></Campo>
              <Campo label="Tema"><input type="text" value={tema} onChange={(e) => setTema(e.target.value)} className="wr-input w-full" /></Campo>
              <Campo label="Comissão atual"><input type="text" value={comissao} onChange={(e) => setComissao(e.target.value)} className="wr-input w-full" /></Campo>
              <Campo label="Relator"><input type="text" value={relator} onChange={(e) => setRelator(e.target.value)} className="wr-input w-full" /></Campo>
              <Campo label="URL oficial"><input type="url" value={url} onChange={(e) => setUrl(e.target.value)} className="wr-input w-full" /></Campo>
              <Campo label="Coautores (vírgula)"><input type="text" value={coautores} onChange={(e) => setCoautores(e.target.value)} className="wr-input w-full" /></Campo>
              <Campo label="Temas de campanha (vírgula)"><input type="text" value={temasCampanha} onChange={(e) => setTemasCampanha(e.target.value)} className="wr-input w-full" /></Campo>
            </div>
            <Campo label="Título"><input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} className="wr-input w-full" /></Campo>
            <Campo label="Ementa"><textarea value={ementa} onChange={(e) => setEmenta(e.target.value)} rows={2} className="wr-input w-full" /></Campo>
            <Campo label="Descrição"><textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} className="wr-input w-full" /></Campo>
            <div className="flex flex-wrap gap-6 pt-1">
              <Toggle on={autor} set={setAutor} label="De autoria do mandato" />
              <Toggle on={alinhamento} set={setAlinhamento} label="Alinhado à campanha" />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button type="button" disabled={salvando} onClick={salvarEdicao} className="wr-btn-dark disabled:opacity-60">{salvando ? "Salvando…" : "Salvar alterações"}</button>
              <button type="button" onClick={() => setEditando(false)} className="wr-btn inline-flex items-center gap-1.5"><X className="h-4 w-4" aria-hidden /> Cancelar</button>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <Info label="Prioridade" valor={rotulo(PRIORIDADES, p.prioridade)} />
            <Info label="Tema" valor={p.tema ?? "—"} />
            <Info label="Relator" valor={p.relator ?? "—"} />
            <Info label="Comissão atual" valor={p.comissao_atual ?? "—"} />
            <Info label="Apresentado em" valor={fmtData(p.data_apresentacao)} />
            <Info label="Última movimentação" valor={fmtData(p.data_ultima_movimentacao)} />
            <Info label="Coautores" valor={(p.coautores ?? []).join(", ") || "—"} />
            <Info label="Temas de campanha" valor={(p.temas_campanha ?? []).join(", ") || "—"} />
            {p.descricao && <div className="sm:col-span-2"><Info label="Descrição" valor={p.descricao} /></div>}
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
function Toggle({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => set(!on)} className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--color-text)" }}>
      <span className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors" style={{ background: on ? "#D7F36A" : "rgba(255,255,255,0.15)" }}>
        <span className="inline-block h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: on ? "translateX(18px)" : "translateX(2px)" }} />
      </span>
      {label}
    </button>
  );
}
