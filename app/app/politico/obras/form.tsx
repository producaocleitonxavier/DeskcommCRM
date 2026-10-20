"use client";

/**
 * Formulário de nova obra/contrato (Obras & Fiscalização). Didático: seções
 * claras, natureza pré-selecionada pelo cargo, vínculo opcional a emenda.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, HardHat, ShieldCheck } from "lucide-react";
import { criarRegistro } from "@/app/actions/politico/gabinete-actions";

export interface EmendaOpcao { id: string; numero: string | null; ano: number; descricao: string; valor_indicado_cents: number }

const TIPOS = [["obra", "Obra"], ["servico", "Serviço"], ["contrato", "Contrato"], ["convenio", "Convênio"], ["equipamento", "Equipamento"], ["programa", "Programa"], ["outro", "Outro"]] as const;
const AREAS = [["saude", "Saúde"], ["educacao", "Educação"], ["seguranca", "Segurança"], ["assistencia_social", "Assistência Social"], ["infraestrutura", "Infraestrutura"], ["mobilidade", "Mobilidade"], ["cultura", "Cultura"], ["esporte", "Esporte"], ["meio_ambiente", "Meio Ambiente"], ["agricultura", "Agricultura"], ["tecnologia", "Tecnologia"], ["outro", "Outro"]] as const;
const STATUSES = [["planejada", "Planejada"], ["em_andamento", "Em andamento"], ["paralisada", "Paralisada"], ["concluida", "Concluída"]] as const;
const PRIOS = [["baixa", "Baixa"], ["normal", "Normal"], ["alta", "Alta"], ["urgente", "Urgente"]] as const;

function reaisParaCents(v: string): number {
  const n = Number(v.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export default function ObraForm({ emendas, naturezaInicial }: { emendas: EmendaOpcao[]; naturezaInicial: "execucao" | "fiscalizacao" }) {
  const router = useRouter();
  const [natureza, setNatureza] = useState(naturezaInicial);
  const [f, setF] = useState({
    titulo: "", tipo: "obra", area_tematica: "", objeto: "", orgao_responsavel: "",
    empresa_nome: "", empresa_cnpj: "", numero_referencia: "", valor: "", fonte_recurso: "", emenda_id: "",
    status: "planejada", municipio: "", bairro: "", data_inicio: "", data_prevista: "",
    responsavel_interno: "", prioridade: "normal", observacoes: "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function salvar() {
    if (!f.titulo.trim()) { setErro("Dê um título à obra/contrato."); return; }
    setSalvando(true); setErro(null);
    const payload: Record<string, unknown> = {
      natureza, titulo: f.titulo.trim(), tipo: f.tipo, status: f.status, prioridade: f.prioridade,
      area_tematica: f.area_tematica || null, objeto: f.objeto || null, orgao_responsavel: f.orgao_responsavel || null,
      empresa_nome: f.empresa_nome || null, empresa_cnpj: f.empresa_cnpj || null, numero_referencia: f.numero_referencia || null,
      valor_cents: reaisParaCents(f.valor), fonte_recurso: f.fonte_recurso || null, emenda_id: f.emenda_id || null,
      municipio: f.municipio || null, bairro: f.bairro || null, data_inicio: f.data_inicio || null, data_prevista: f.data_prevista || null,
      responsavel_interno: f.responsavel_interno || null, observacoes: f.observacoes || null,
    };
    const r = await criarRegistro("pol_obras", payload);
    if (r.ok && r.id) router.push(`/app/politico/obras/${r.id}`);
    else { setErro(r.ok ? "Erro ao salvar." : r.erro); setSalvando(false); }
  }

  return (
    <div className="space-y-5">
      {/* Natureza */}
      <section className="wr-card p-5">
        <Legenda titulo="Natureza" dica="Você fiscaliza o que o poder público faz, ou executa/gerencia o contrato?" />
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <BotaoNatureza ativo={natureza === "fiscalizacao"} onClick={() => setNatureza("fiscalizacao")} icon={<ShieldCheck className="h-4 w-4" />} titulo="Fiscalização" desc="Acompanho e cobro (vistoria, checklist, foto)." />
          <BotaoNatureza ativo={natureza === "execucao"} onClick={() => setNatureza("execucao")} icon={<HardHat className="h-4 w-4" />} titulo="Execução" desc="Gerencio o contrato (fornecedor, valor, prazo)." />
        </div>
      </section>

      {/* O que é */}
      <section className="wr-card space-y-3 p-5">
        <Legenda titulo="O que é" />
        <Campo label="Título *"><input className="wr-input w-full" value={f.titulo} onChange={set("titulo")} placeholder="Ex.: Reforma da UBS do bairro Jardim das Flores" /></Campo>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo label="Tipo"><select className="wr-input w-full" value={f.tipo} onChange={set("tipo")}>{TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Campo>
          <Campo label="Área"><select className="wr-input w-full" value={f.area_tematica} onChange={set("area_tematica")}><option value="">—</option>{AREAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Campo>
        </div>
        <Campo label="Objeto (o que é/estado atual)"><textarea className="wr-input w-full" rows={2} value={f.objeto} onChange={set("objeto")} placeholder="Descreva a obra/serviço e a situação." /></Campo>
      </section>

      {/* Responsável & recurso */}
      <section className="wr-card space-y-3 p-5">
        <Legenda titulo="Responsável & recurso" dica="Quem executa e de onde vem o dinheiro." />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo label="Órgão responsável"><input className="wr-input w-full" value={f.orgao_responsavel} onChange={set("orgao_responsavel")} placeholder="Ex.: Secretaria de Obras" /></Campo>
          <Campo label="Nº do contrato/convênio"><input className="wr-input w-full" value={f.numero_referencia} onChange={set("numero_referencia")} placeholder="Ex.: 014/2026" /></Campo>
          <Campo label="Empresa contratada"><input className="wr-input w-full" value={f.empresa_nome} onChange={set("empresa_nome")} /></Campo>
          <Campo label="CNPJ da empresa"><input className="wr-input w-full" value={f.empresa_cnpj} onChange={set("empresa_cnpj")} placeholder="00.000.000/0001-00" /></Campo>
          <Campo label="Valor (R$)"><input className="wr-input w-full" value={f.valor} onChange={set("valor")} placeholder="150.000" inputMode="decimal" /></Campo>
          <Campo label="Fonte do recurso"><input className="wr-input w-full" value={f.fonte_recurso} onChange={set("fonte_recurso")} placeholder="Ex.: Emenda, Tesouro, Convênio federal" /></Campo>
        </div>
        <Campo label="Vincular à emenda (opcional)">
          <select className="wr-input w-full" value={f.emenda_id} onChange={set("emenda_id")} disabled={emendas.length === 0}>
            <option value="">{emendas.length === 0 ? "— nenhuma emenda cadastrada —" : "— nenhuma —"}</option>
            {emendas.map((e) => <option key={e.id} value={e.id}>{e.numero ? `${e.numero}/${e.ano}` : `Emenda ${e.ano}`} — {e.descricao.slice(0, 50)}</option>)}
          </select>
          <span className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
            {emendas.length === 0
              ? "A emenda é o recurso que você destinou (cadastre em Gabinete › Emendas). Vincular aqui amarra o dinheiro à obra — e ao voto do bairro."
              : "Amarra o recurso (emenda) a esta obra: o dinheiro que você destinou virando entrega no território."}
          </span>
        </Campo>
      </section>

      {/* Onde & quando */}
      <section className="wr-card space-y-3 p-5">
        <Legenda titulo="Onde & quando" dica="O bairro liga a obra ao peso eleitoral do território." />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo label="Município"><input className="wr-input w-full" value={f.municipio} onChange={set("municipio")} /></Campo>
          <Campo label="Bairro"><input className="wr-input w-full" value={f.bairro} onChange={set("bairro")} /></Campo>
          <Campo label="Início"><input type="date" className="wr-input w-full" value={f.data_inicio} onChange={set("data_inicio")} /></Campo>
          <Campo label="Previsão de entrega"><input type="date" className="wr-input w-full" value={f.data_prevista} onChange={set("data_prevista")} /></Campo>
        </div>
      </section>

      {/* Gestão */}
      <section className="wr-card space-y-3 p-5">
        <Legenda titulo="Gestão" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Campo label="Status"><select className="wr-input w-full" value={f.status} onChange={set("status")}>{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Campo>
          <Campo label="Prioridade"><select className="wr-input w-full" value={f.prioridade} onChange={set("prioridade")}>{PRIOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Campo>
          <Campo label="Responsável (assessor)"><input className="wr-input w-full" value={f.responsavel_interno} onChange={set("responsavel_interno")} /></Campo>
        </div>
        <Campo label="Observações"><textarea className="wr-input w-full" rows={2} value={f.observacoes} onChange={set("observacoes")} /></Campo>
      </section>

      {erro && <p className="text-sm" style={{ color: "#E08079" }}>{erro}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={salvar} disabled={salvando}
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-60" style={{ background: "#D7F36A", color: "#16181D" }}>
          {salvando ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Salvando…</> : "Salvar e abrir"}
        </button>
        <button type="button" onClick={() => router.push("/app/politico/obras")} className="rounded-full px-5 py-2.5 text-sm font-semibold" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>Cancelar</button>
      </div>
    </div>
  );
}

function Legenda({ titulo, dica }: { titulo: string; dica?: string }) {
  return (
    <div>
      <h3 className="font-heading text-sm font-bold" style={{ color: "var(--color-text)" }}>{titulo}</h3>
      {dica && <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>{dica}</p>}
    </div>
  );
}
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1"><span className="text-xs font-semibold" style={{ color: "var(--color-text-subtle)" }}>{label}</span>{children}</label>;
}
function BotaoNatureza({ ativo, onClick, icon, titulo, desc }: { ativo: boolean; onClick: () => void; icon: React.ReactNode; titulo: string; desc: string }) {
  return (
    <button type="button" onClick={onClick} className="flex items-start gap-2.5 rounded-xl p-3 text-left transition-colors"
      style={ativo ? { background: "rgba(215,243,106,0.12)", border: "1px solid #D7F36A" } : { border: "1px solid var(--color-border)" }}>
      <span className="mt-0.5" style={{ color: ativo ? "#D7F36A" : "var(--color-text-subtle)" }}>{icon}</span>
      <span><span className="block text-sm font-bold" style={{ color: "var(--color-text)" }}>{titulo}</span><span className="block text-xs" style={{ color: "var(--color-text-muted)" }}>{desc}</span></span>
    </button>
  );
}
