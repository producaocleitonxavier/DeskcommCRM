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
import { ArrowLeft, Check, Pencil, X, Users, Copy } from "lucide-react";

import { atualizarRegistro } from "@/app/actions/politico/gabinete-actions";
import { listarBeneficiariosEmenda, type BeneficiarioObra } from "@/app/actions/politico/obras-actions";

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
  bairro: string | null;
  entidade_beneficiada: string | null;
  cnpj_entidade: string | null;
  territory_id: string | null;
  responsavel_nome: string | null;
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
  peso?: import("@/app/actions/politico/obras-actions").PesoBairro | null;
  mandatoNome?: string | null;
  beneficiarios?: number;
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

export default function DetalheEmendaClient({ emenda, liderancas, peso, mandatoNome, beneficiarios = 0 }: Props) {
  const router = useRouter();

  const [e, setE] = useState<EmendaDetalhe>(emenda);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [avAberto, setAvAberto] = useState(false); // painel de "avançar etapa" (valor + data)
  const [avValor, setAvValor] = useState("");

  // Campos de edição
  const [numero, setNumero] = useState(e.numero ?? "");
  const [ano, setAno] = useState(String(e.ano));
  const [tipo, setTipo] = useState(e.tipo);
  const [esfera, setEsfera] = useState(e.esfera);
  const [area, setArea] = useState(e.area_tematica);
  const [descricao, setDescricao] = useState(e.descricao ?? "");
  const [objeto, setObjeto] = useState(e.objeto ?? "");
  const [municipio, setMunicipio] = useState(e.municipio ?? "");
  const [bairro, setBairro] = useState(e.bairro ?? "");
  const [entidade, setEntidade] = useState(e.entidade_beneficiada ?? "");
  const [cnpj, setCnpj] = useState(e.cnpj_entidade ?? "");
  const [responsavel, setResponsavel] = useState(e.responsavel_nome ?? "");
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
    const res = await atualizarRegistro("pol_emendas", e.id, patch);
    setSalvando(false);
    if (!res.ok) {
      setErro(res.erro);
      return false;
    }
    setE((prev) => ({ ...prev, ...otim }));
    router.refresh();
    return true;
  }

  async function avancar(novoStatus: string, dataKey: string, valorKey?: string, valorStr?: string) {
    const hoje = new Date().toISOString().slice(0, 10);
    const patch: Record<string, unknown> = { status: novoStatus, [dataKey]: hoje };
    if (valorKey && valorStr !== undefined) patch[valorKey] = reaisParaCents(valorStr);
    const ok = await persistir(patch, patch as Partial<EmendaDetalhe>);
    if (ok) { setAvAberto(false); setAvValor(""); }
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
      bairro: bairro.trim() || null,
      entidade_beneficiada: entidade.trim() || null,
      cnpj_entidade: cnpj.trim() || null,
      responsavel_nome: responsavel.trim() || null,
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
      ? { label: "Registrar empenho", novo: "empenhada", dataKey: "data_empenho", valorKey: "valor_empenhado_cents", valorLabel: "Valor empenhado (R$)" }
      : e.status === "empenhada"
        ? { label: "Registrar liquidação", novo: "liquidada", dataKey: "data_liquidacao", valorKey: "valor_liquidado_cents", valorLabel: "Valor liquidado (R$)" }
        : e.status === "liquidada"
          ? { label: "Registrar pagamento", novo: "paga", dataKey: "data_pagamento", valorKey: "valor_pago_cents", valorLabel: "Valor pago (R$)" }
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
              <button type="button" disabled={salvando} onClick={() => { setAvValor(""); setAvAberto((v) => !v); }} className="wr-btn-dark">
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
        {/* Avançar etapa: captura VALOR + data juntos (resolve o valor que ficava 0). */}
        {avAberto && proximaAcao && !editando && (
          <div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl p-3" style={{ background: "rgba(215,243,106,0.06)", border: "1px solid rgba(215,243,106,0.3)" }}>
            <Campo label={proximaAcao.valorLabel}>
              <input type="text" inputMode="decimal" value={avValor} onChange={(ev) => setAvValor(ev.target.value)} placeholder="0,00" className="wr-input" style={{ minWidth: 160 }} autoFocus />
            </Campo>
            <button type="button" disabled={salvando} onClick={() => avancar(proximaAcao.novo, proximaAcao.dataKey, proximaAcao.valorKey, avValor)} className="wr-btn-dark disabled:opacity-60">
              {salvando ? "Salvando…" : "Confirmar"}
            </button>
            <button type="button" onClick={() => setAvAberto(false)} className="wr-btn">Cancelar</button>
          </div>
        )}
      </header>

      {erro && (
        <div role="alert" className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FBE4E2", color: "#A3302A" }}>{erro}</div>
      )}

      {peso && (peso.meusVotos > 0 || peso.leads > 0) && (
        <section className="wr-card p-5" style={{ background: "linear-gradient(180deg, rgba(215,243,106,0.06), transparent)" }}>
          <h2 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>Você investiu onde te elegeu?</h2>
          <p className="mb-3 text-xs" style={{ color: "var(--color-text-subtle)" }}>
            O que {mandatoNome || "você"} fez e tem no bairro <strong style={{ color: "var(--color-text)" }}>{emenda.bairro || "—"}</strong> — o retorno eleitoral deste recurso.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <PesoBox valor={peso.meusVotos.toLocaleString("pt-BR")} label="Seus votos ali" sub={peso.universo > 0 ? `${((peso.meusVotos / peso.universo) * 100).toFixed(1)}% do bairro` : "no último pleito"} accent="#D7F36A" />
            <PesoBox valor={peso.universo.toLocaleString("pt-BR")} label="Votos do cargo" sub="tamanho eleitoral" />
            <PesoBox valor={peso.leads.toLocaleString("pt-BR")} label="Sua base (CRM)" sub="contatos no bairro" accent="#7da9bf" />
          </div>
        </section>
      )}

      <CaptacaoEmendaCard emendaId={e.id} beneficiarios={beneficiarios} />

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
              <Campo label="Bairro"><input type="text" value={bairro} onChange={(ev) => setBairro(ev.target.value)} className="wr-input w-full" /></Campo>
              <Campo label="Entidade"><input type="text" value={entidade} onChange={(ev) => setEntidade(ev.target.value)} className="wr-input w-full" /></Campo>
              <Campo label="CNPJ"><input type="text" value={cnpj} onChange={(ev) => setCnpj(ev.target.value)} className="wr-input w-full" /></Campo>
              <Campo label="Beneficiários"><input type="number" value={beneficiarios} onChange={(ev) => setBeneficiarios(ev.target.value)} className="wr-input w-full" /></Campo>
              <Campo label="Responsável pela emenda"><input type="text" value={responsavel} onChange={(ev) => setResponsavel(ev.target.value)} className="wr-input w-full" placeholder="Nome livre" /></Campo>
              {liderancas.length > 0 && <Campo label="Vincular liderança (opcional)"><select value={liderancaId} onChange={(ev) => setLiderancaId(ev.target.value)} className="wr-input w-full"><option value="">—</option>{liderancas.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></Campo>}
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
            <Info label="Bairro" valor={e.bairro ?? "—"} />
            <Info label="Entidade beneficiada" valor={e.entidade_beneficiada ?? "—"} />
            <Info label="CNPJ" valor={e.cnpj_entidade ?? "—"} />
            <Info label="Responsável" valor={e.responsavel_nome || rotulo(liderancas, e.lideranca_id)} />
            <Info label="Beneficiários estimados" valor={e.beneficiarios_estimados ? e.beneficiarios_estimados.toLocaleString("pt-BR") : "—"} />
            <Info label="Prazo de execução" valor={fmtData(e.prazo_execucao)} />
            {e.observacoes && <div className="sm:col-span-2"><Info label="Observações" valor={e.observacoes} /></div>}
          </dl>
        )}
      </section>
    </div>
  );
}

function CaptacaoEmendaCard({ emendaId, beneficiarios }: { emendaId: string; beneficiarios: number }) {
  const [copiado, setCopiado] = useState(false);
  const [verando, setVerando] = useState(false);
  const [lista, setLista] = useState<BeneficiarioObra[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const link = typeof window !== "undefined" ? `${window.location.origin}/e/${emendaId}` : `/e/${emendaId}`;
  async function copiar() { try { await navigator.clipboard.writeText(link); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* ignore */ } }
  async function ver() { if (verando) { setVerando(false); return; } setVerando(true); if (lista === null) { setCarregando(true); setLista(await listarBeneficiariosEmenda(emendaId)); setCarregando(false); } }
  return (
    <section className="wr-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Users className="h-5 w-5 shrink-0" aria-hidden style={{ color: "#D7F36A" }} />
          <div>
            <h2 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>Captação de beneficiários</h2>
            <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Dê este link à entidade beneficiada: cada cadastro vira base sua, no bairro. O link aceita cadastros ilimitados.</p>
          </div>
        </div>
        <div className="text-right">
          <div className="font-heading text-2xl font-bold tabular-nums" style={{ color: "#D7F36A" }}>{beneficiarios.toLocaleString("pt-BR")}</div>
          <div className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>cadastrados</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input readOnly value={link} className="wr-input flex-1 text-xs" onFocus={(ev) => ev.currentTarget.select()} style={{ minWidth: 200 }} />
        <button type="button" onClick={copiar} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold" style={{ background: "#D7F36A", color: "#16181D" }}><Copy className="h-4 w-4" aria-hidden /> {copiado ? "Copiado!" : "Copiar link"}</button>
        {beneficiarios > 0 && <button type="button" onClick={ver} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}><Users className="h-4 w-4" aria-hidden /> {verando ? "Ocultar" : "Ver cadastros"}</button>}
      </div>
      {verando && (
        <div className="mt-3 overflow-hidden rounded-lg" style={{ border: "1px solid var(--color-border)" }}>
          {carregando ? <div className="p-4 text-center text-sm" style={{ color: "var(--color-text-subtle)" }}>Carregando…</div>
            : (lista && lista.length > 0) ? (
              <table className="w-full text-sm">
                <thead><tr style={{ borderBottom: "1px solid var(--color-border)" }}>{["Nome", "WhatsApp", "Bairro", "Data"].map((h) => <th key={h} className="px-3 py-2 text-left text-[12px] font-medium" style={{ color: "var(--color-text-subtle)" }}>{h}</th>)}</tr></thead>
                <tbody>{lista.map((b, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td className="px-3 py-2 font-medium" style={{ color: "var(--color-text)" }}>{b.nome ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>{b.telefone ?? "—"}</td>
                    <td className="px-3 py-2" style={{ color: "var(--color-text-muted)" }}>{[b.bairro, b.cidade].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-3 py-2 text-[12px]" style={{ color: "var(--color-text-subtle)" }}>{new Date(b.created_at).toLocaleDateString("pt-BR")}</td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <div className="p-4 text-center text-sm" style={{ color: "var(--color-text-subtle)" }}>Nenhum cadastro ainda.</div>}
        </div>
      )}
    </section>
  );
}
function PesoBox({ valor, label, sub, accent }: { valor: string; label: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--color-border)" }}>
      <div className="font-heading text-xl font-bold tabular-nums" style={{ color: accent ?? "var(--color-text)" }}>{valor}</div>
      <div className="text-[12px] font-medium" style={{ color: "var(--color-text-muted)" }}>{label}</div>
      {sub && <div className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>{sub}</div>}
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
