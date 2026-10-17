"use client";

/**
 * Detalhe/edição + pipeline de execução de uma emenda (Gabinete). Mostra o
 * caminho Indicada → Empenhada → Liquidada → Paga com valor e data por etapa,
 * permite avançar etapa (carimba a data) e editar todos os campos. Grava via
 * Supabase browser client (RLS). Valores em R$ ⇄ _cents.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Pencil, X } from "lucide-react";

import { createClient } from "@/lib/supabase/browser";

interface Opcao {
  id: string;
  nome: string;
}

export interface EmendaDetalhe {
  id: string;
  numero: string | null;
  ano: number;
  tipo: string;
  esfera: string;
  valor_indicado_cents: number;
  valor_empenhado_cents: number;
  valor_liquidado_cents: number;
  valor_pago_cents: number;
  municipio: string | null;
  entidade_beneficiada: string | null;
  cnpj_entidade: string | null;
  territory_id: string | null;
  area_tematica: string;
  descricao: string;
  objeto: string | null;
  status: string;
  data_indicacao: string | null;
  data_empenho: string | null;
  data_liquidacao: string | null;
  data_pagamento: string | null;
  prazo_execucao: string | null;
  beneficiarios_estimados: number | null;
  lideranca_id: string | null;
  observacoes: string | null;
}

export interface Props {
  emenda: EmendaDetalhe;
  territorios: Opcao[];
  liderancas: Opcao[];
}

const TIPOS: Opcao[] = [
  { id: "individual", nome: "Individual" },
  { id: "bancada", nome: "Bancada" },
  { id: "comissao", nome: "Comissão" },
  { id: "relator", nome: "Relator" },
  { id: "pix", nome: "PIX" },
];
const ESFERAS: Opcao[] = [
  { id: "municipal", nome: "Municipal" },
  { id: "estadual", nome: "Estadual" },
  { id: "federal", nome: "Federal" },
];
const AREAS: Opcao[] = [
  { id: "saude", nome: "Saúde" },
  { id: "educacao", nome: "Educação" },
  { id: "seguranca", nome: "Segurança" },
  { id: "assistencia_social", nome: "Assistência social" },
  { id: "infraestrutura", nome: "Infraestrutura" },
  { id: "cultura", nome: "Cultura" },
  { id: "esporte", nome: "Esporte" },
  { id: "meio_ambiente", nome: "Meio ambiente" },
  { id: "agricultura", nome: "Agricultura" },
  { id: "tecnologia", nome: "Tecnologia" },
  { id: "outro", nome: "Outro" },
];
const STATUS_OPC: Opcao[] = [
  { id: "rascunho", nome: "Rascunho" },
  { id: "indicada", nome: "Indicada" },
  { id: "empenhada", nome: "Empenhada" },
  { id: "liquidada", nome: "Liquidada" },
  { id: "paga", nome: "Paga" },
  { id: "devolvida", nome: "Devolvida" },
  { id: "cancelada", nome: "Cancelada" },
];
const ORDER: Record<string, number> = { rascunho: 0, indicada: 1, empenhada: 2, liquidada: 3, paga: 4 };
const STAGES = [
  { label: "Indicada", valor: "valor_indicado_cents", data: "data_indicacao" },
  { label: "Empenhada", valor: "valor_empenhado_cents", data: "data_empenho" },
  { label: "Liquidada", valor: "valor_liquidado_cents", data: "data_liquidacao" },
  { label: "Paga", valor: "valor_pago_cents", data: "data_pagamento" },
] as const;

function reaisParaCents(v: string): number {
  const n = Number(v.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function centsParaReais(cents: number): string {
  return (Number(cents ?? 0) / 100).toFixed(2).replace(".", ",");
}
function moeda(cents: number): string {
  return (Number(cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtData(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
function rotulo(lista: Opcao[], id: string | null): string {
  if (!id) return "—";
  return lista.find((o) => o.id === id)?.nome ?? id;
}

export default function DetalheEmendaClient({ emenda, territorios, liderancas }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [e, setE] = useState<EmendaDetalhe>(emenda);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Campos de edição
  const [numero, setNumero] = useState(e.numero ?? "");
  const [ano, setAno] = useState(String(e.ano));
  const [tipo, setTipo] = useState(e.tipo);
  const [esfera, setEsfera] = useState(e.esfera);
  const [area, setArea] = useState(e.area_tematica);
  const [descricao, setDescricao] = useState(e.descricao ?? "");
  const [objeto, setObjeto] = useState(e.objeto ?? "");
  const [municipio, setMunicipio] = useState(e.municipio ?? "");
  const [entidade, setEntidade] = useState(e.entidade_beneficiada ?? "");
  const [cnpj, setCnpj] = useState(e.cnpj_entidade ?? "");
  const [territoryId, setTerritoryId] = useState(e.territory_id ?? "");
  const [liderancaId, setLiderancaId] = useState(e.lideranca_id ?? "");
  const [status, setStatus] = useState(e.status);
  const [vIndicado, setVIndicado] = useState(centsParaReais(e.valor_indicado_cents));
  const [vEmpenhado, setVEmpenhado] = useState(centsParaReais(e.valor_empenhado_cents));
  const [vLiquidado, setVLiquidado] = useState(centsParaReais(e.valor_liquidado_cents));
  const [vPago, setVPago] = useState(centsParaReais(e.valor_pago_cents));
  const [dIndicacao, setDIndicacao] = useState(e.data_indicacao ?? "");
  const [dEmpenho, setDEmpenho] = useState(e.data_empenho ?? "");
  const [dLiquidacao, setDLiquidacao] = useState(e.data_liquidacao ?? "");
  const [dPagamento, setDPagamento] = useState(e.data_pagamento ?? "");
  const [prazo, setPrazo] = useState(e.prazo_execucao ?? "");
  const [beneficiarios, setBeneficiarios] = useState(e.beneficiarios_estimados ? String(e.beneficiarios_estimados) : "");
  const [observacoes, setObservacoes] = useState(e.observacoes ?? "");

  async function persistir(patch: Record<string, unknown>, otim: Partial<EmendaDetalhe>) {
    setErro(null);
    setSalvando(true);
    const { error } = await supabase.from("pol_emendas").update(patch).eq("id", e.id);
    setSalvando(false);
    if (error) {
      setErro(`Não foi possível salvar: ${error.message}`);
      return false;
    }
    setE((prev) => ({ ...prev, ...otim }));
    router.refresh();
    return true;
  }

  async function avancar(novoStatus: string, dataKey: string) {
    const hoje = new Date().toISOString().slice(0, 10);
    await persistir({ status: novoStatus, [dataKey]: hoje }, { status: novoStatus, [dataKey]: hoje } as Partial<EmendaDetalhe>);
  }

  async function salvarEdicao() {
    const anoNum = Number(ano);
    if (!anoNum) return setErro("Ano inválido.");
    if (!descricao.trim()) return setErro("Descrição é obrigatória.");
    const patch: Record<string, unknown> = {
      numero: numero.trim() || null,
      ano: anoNum,
      tipo,
      esfera,
      area_tematica: area,
      descricao: descricao.trim(),
      objeto: objeto.trim() || null,
      municipio: municipio.trim() || null,
      entidade_beneficiada: entidade.trim() || null,
      cnpj_entidade: cnpj.trim() || null,
      territory_id: territoryId || null,
      lideranca_id: liderancaId || null,
      status,
      valor_indicado_cents: reaisParaCents(vIndicado),
      valor_empenhado_cents: reaisParaCents(vEmpenhado),
      valor_liquidado_cents: reaisParaCents(vLiquidado),
      valor_pago_cents: reaisParaCents(vPago),
      data_indicacao: dIndicacao || null,
      data_empenho: dEmpenho || null,
      data_liquidacao: dLiquidacao || null,
      data_pagamento: dPagamento || null,
      prazo_execucao: prazo || null,
      beneficiarios_estimados: beneficiarios.trim() && Number(beneficiarios) ? Number(beneficiarios) : null,
      observacoes: observacoes.trim() || null,
    };
    const ok = await persistir(patch, patch as unknown as Partial<EmendaDetalhe>);
    if (ok) setEditando(false);
  }

  const idx = ORDER[e.status] ?? 0;
  const terminal = e.status === "devolvida" || e.status === "cancelada";
  const valores = [e.valor_indicado_cents, e.valor_empenhado_cents, e.valor_liquidado_cents, e.valor_pago_cents];
  const datas = [e.data_indicacao, e.data_empenho, e.data_liquidacao, e.data_pagamento];
  const destino = e.municipio || e.entidade_beneficiada || "—";

  const proximaAcao =
    e.status === "indicada"
      ? { label: "Registrar empenho", novo: "empenhada", dataKey: "data_empenho" }
      : e.status === "empenhada"
        ? { label: "Registrar liquidação", novo: "liquidada", dataKey: "data_liquidacao" }
        : e.status === "liquidada"
          ? { label: "Registrar pagamento", novo: "paga", dataKey: "data_pagamento" }
          : null;

  return (
    <div className="mx-auto max-w-[900px] px-4 py-7 space-y-5" style={{ background: "var(--color-bg)" }}>
      <div>
        <Link href="/app/politico/emendas" className="inline-flex items-center gap-1 text-sm transition-colors" style={{ color: "var(--color-text-muted)" }}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Emendas
        </Link>
      </div>

      <header className="wr-card p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-subtle)" }}>
              {e.numero ?? "s/nº"} · {e.ano} · {rotulo(TIPOS, e.tipo)} · {rotulo(ESFERAS, e.esfera)}
            </div>
            <h1 className="mt-1 font-heading text-2xl font-bold leading-tight" style={{ color: "var(--color-text)" }}>{destino}</h1>
            <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>{rotulo(AREAS, e.area_tematica)} · {e.descricao}</p>
          </div>
          <div className="flex items-center gap-2">
            {proximaAcao && !editando && (
              <button type="button" disabled={salvando} onClick={() => avancar(proximaAcao.novo, proximaAcao.dataKey)} className="wr-btn-dark">
                {proximaAcao.label}
              </button>
            )}
            {!editando && (
              <button type="button" onClick={() => setEditando(true)} className="wr-btn inline-flex items-center gap-2">
                <Pencil className="h-4 w-4" aria-hidden /> Editar
              </button>
            )}
          </div>
        </div>

        {/* Pipeline de execução */}
        {!terminal && (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STAGES.map((s, i) => {
              const reached = idx >= i + 1;
              return (
                <div
                  key={s.label}
                  className="rounded-xl p-3"
                  style={{
                    background: reached ? "rgba(215,243,106,0.1)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${reached ? "rgba(215,243,106,0.35)" : "var(--color-border)"}`,
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{ background: reached ? "#D7F36A" : "rgba(255,255,255,0.1)", color: reached ? "#16181D" : "var(--color-text-subtle)" }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-xs font-semibold" style={{ color: reached ? "var(--color-text)" : "var(--color-text-subtle)" }}>{s.label}</span>
                  </div>
                  <div className="mt-1.5 text-sm font-bold tabular-nums" style={{ color: reached ? "var(--color-text)" : "var(--color-text-subtle)" }}>
                    {moeda(valores[i] ?? 0)}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>{fmtData(datas[i] ?? null)}</div>
                </div>
              );
            })}
          </div>
        )}
        {terminal && (
          <div className="mt-4">
            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "#FBE4E2", color: "#A3302A" }}>
              {rotulo(STATUS_OPC, e.status)}
            </span>
          </div>
        )}
      </header>

      {erro && (
        <div role="alert" className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FBE4E2", color: "#A3302A" }}>{erro}</div>
      )}

      <section className="wr-card p-6 sm:p-7">
        {editando ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo label="Nº"><input type="text" value={numero} onChange={(ev) => setNumero(ev.target.value)} className="wr-input w-full" /></Campo>
              <Campo label="Ano"><input type="number" value={ano} onChange={(ev) => setAno(ev.target.value)} className="wr-input w-full" /></Campo>
              <Campo label="Tipo"><select value={tipo} onChange={(ev) => setTipo(ev.target.value)} className="wr-input w-full">{TIPOS.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></Campo>
              <Campo label="Esfera"><select value={esfera} onChange={(ev) => setEsfera(ev.target.value)} className="wr-input w-full">{ESFERAS.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></Campo>
              <Campo label="Área"><select value={area} onChange={(ev) => setArea(ev.target.value)} className="wr-input w-full">{AREAS.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></Campo>
              <Campo label="Status"><select value={status} onChange={(ev) => setStatus(ev.target.value)} className="wr-input w-full">{STATUS_OPC.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></Campo>
            </div>
            <Campo label="Descrição"><textarea value={descricao} onChange={(ev) => setDescricao(ev.target.value)} rows={2} className="wr-input w-full" /></Campo>
            <Campo label="Objeto"><input type="text" value={objeto} onChange={(ev) => setObjeto(ev.target.value)} className="wr-input w-full" /></Campo>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo label="Município"><input type="text" value={municipio} onChange={(ev) => setMunicipio(ev.target.value)} className="wr-input w-full" /></Campo>
              <Campo label="Entidade"><input type="text" value={entidade} onChange={(ev) => setEntidade(ev.target.value)} className="wr-input w-full" /></Campo>
              <Campo label="CNPJ"><input type="text" value={cnpj} onChange={(ev) => setCnpj(ev.target.value)} className="wr-input w-full" /></Campo>
              <Campo label="Beneficiários"><input type="number" value={beneficiarios} onChange={(ev) => setBeneficiarios(ev.target.value)} className="wr-input w-full" /></Campo>
              {territorios.length > 0 && <Campo label="Território"><select value={territoryId} onChange={(ev) => setTerritoryId(ev.target.value)} className="wr-input w-full"><option value="">—</option>{territorios.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></Campo>}
              {liderancas.length > 0 && <Campo label="Liderança"><select value={liderancaId} onChange={(ev) => setLiderancaId(ev.target.value)} className="wr-input w-full"><option value="">—</option>{liderancas.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></Campo>}
            </div>
            {/* Valores e datas por etapa */}
            <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--color-border)" }}>
              <div className="mb-2 text-sm font-semibold" style={{ color: "var(--color-text)" }}>Execução (R$ e datas)</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Campo label="Indicado (R$)"><input type="text" inputMode="decimal" value={vIndicado} onChange={(ev) => setVIndicado(ev.target.value)} className="wr-input w-full" /></Campo>
                <Campo label="Data indicação"><input type="date" value={dIndicacao} onChange={(ev) => setDIndicacao(ev.target.value)} className="wr-input w-full" /></Campo>
                <Campo label="Empenhado (R$)"><input type="text" inputMode="decimal" value={vEmpenhado} onChange={(ev) => setVEmpenhado(ev.target.value)} className="wr-input w-full" /></Campo>
                <Campo label="Data empenho"><input type="date" value={dEmpenho} onChange={(ev) => setDEmpenho(ev.target.value)} className="wr-input w-full" /></Campo>
                <Campo label="Liquidado (R$)"><input type="text" inputMode="decimal" value={vLiquidado} onChange={(ev) => setVLiquidado(ev.target.value)} className="wr-input w-full" /></Campo>
                <Campo label="Data liquidação"><input type="date" value={dLiquidacao} onChange={(ev) => setDLiquidacao(ev.target.value)} className="wr-input w-full" /></Campo>
                <Campo label="Pago (R$)"><input type="text" inputMode="decimal" value={vPago} onChange={(ev) => setVPago(ev.target.value)} className="wr-input w-full" /></Campo>
                <Campo label="Data pagamento"><input type="date" value={dPagamento} onChange={(ev) => setDPagamento(ev.target.value)} className="wr-input w-full" /></Campo>
                <Campo label="Prazo de execução"><input type="date" value={prazo} onChange={(ev) => setPrazo(ev.target.value)} className="wr-input w-full" /></Campo>
              </div>
            </div>
            <Campo label="Observações"><textarea value={observacoes} onChange={(ev) => setObservacoes(ev.target.value)} rows={2} className="wr-input w-full" /></Campo>
            <div className="flex items-center gap-3 pt-1">
              <button type="button" disabled={salvando} onClick={salvarEdicao} className="wr-btn-dark disabled:opacity-60">{salvando ? "Salvando…" : "Salvar alterações"}</button>
              <button type="button" onClick={() => setEditando(false)} className="wr-btn inline-flex items-center gap-1.5"><X className="h-4 w-4" aria-hidden /> Cancelar</button>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <Info label="Objeto" valor={e.objeto ?? "—"} />
            <Info label="Município" valor={e.municipio ?? "—"} />
            <Info label="Entidade beneficiada" valor={e.entidade_beneficiada ?? "—"} />
            <Info label="CNPJ" valor={e.cnpj_entidade ?? "—"} />
            <Info label="Território" valor={rotulo(territorios, e.territory_id)} />
            <Info label="Liderança" valor={rotulo(liderancas, e.lideranca_id)} />
            <Info label="Beneficiários estimados" valor={e.beneficiarios_estimados ? e.beneficiarios_estimados.toLocaleString("pt-BR") : "—"} />
            <Info label="Prazo de execução" valor={fmtData(e.prazo_execucao)} />
            {e.observacoes && <div className="sm:col-span-2"><Info label="Observações" valor={e.observacoes} /></div>}
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
